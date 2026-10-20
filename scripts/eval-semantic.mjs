import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
import { answerResidentQuestion } from '../src/lib/core/resident.mjs';
import { parseLlmConfig, publicLlmInfo, createHttpProvider } from '../src/lib/llm/index.mjs';
import { reliabilityDataset } from '../evaluation/suite/reliability.mjs';
import { regressionDataset, housingDirectory, validateRegressionDataset,
  REGRESSION_CATEGORIES } from '../evaluation/regression.mjs';
import { PROJECT_ROOT, resolveOutput, prepareOutputDirectory } from '../evaluation/suite/runner.mjs';

const JUDGMENT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    supported: { type: 'boolean' },
    relevant: { type: 'boolean' },
    uncertaintyAppropriate: { type: 'boolean' },
  },
  required: ['supported', 'relevant', 'uncertaintyAppropriate'],
};
const rate = (passed, total) => total ? passed / total : null;

export function selectSemanticCases(dataset, limit) {
  const groups = REGRESSION_CATEGORIES.map(category =>
    dataset.cases.filter(row => row.category === category));
  const selected = [];
  for (let offset = 0; selected.length < limit; offset++) {
    let added = false;
    for (const group of groups) {
      if (group[offset] && selected.length < limit) {
        selected.push(group[offset]);
        added = true;
      }
    }
    if (!added) break;
  }
  return selected;
}

export function parseSemanticArguments(args) {
  const options = { limit: 10, budgetMs: 60000, output: 'work/evals/semantic' };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--help') { options.help = true; continue; }
    if (flag === '--allow-provider-call') { options.authorized = true; continue; }
    const value = args[++i];
    if (value === undefined || value.startsWith('--') || seen.has(flag))
      throw new Error(`Missing or duplicate value for ${flag}.`);
    if (flag === '--limit') {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100)
        throw new Error('Limit must be between 1 and 100.');
      options.limit = Number(value);
    } else if (flag === '--budget-ms') {
      if (!/^\d+$/.test(value) || Number(value) < 1000 || Number(value) > 600000)
        throw new Error('Budget must be between 1000 and 600000 ms.');
      options.budgetMs = Number(value);
    } else if (flag === '--output') options.output = value;
    else throw new Error(`Unknown semantic evaluation option: ${flag}.`);
    seen.add(flag);
  }
  return options;
}

async function localEnvironment() {
  let env = {};
  try { env = parseEnv(await fs.readFile(path.join(PROJECT_ROOT, '.env'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Unable to read model configuration.'); }
  const keys = ['LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY',
    'LLM_TIMEOUT_MS', 'LLM_MAX_RESPONSE_BYTES', 'LLM_ALLOW_PRIVATE_HTTP'];
  return Object.fromEntries(keys.map(key => [key, process.env[key] ?? env[key]]));
}

function parseJudgment(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) throw new Error('Invalid judge output.');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(',') !== 'relevant,supported,uncertaintyAppropriate' ||
      Object.values(parsed).some(value => typeof value !== 'boolean'))
    throw new Error('Invalid judge output.');
  return parsed;
}

export async function evaluateSemantic({
  dataset = regressionDataset, config, provider, limit = 10, budgetMs = 60000,
  answer = answerResidentQuestion,
} = {}) {
  validateRegressionDataset(dataset);
  if (!config?.enabled || !config.valid || !['ollama', 'openai-compatible'].includes(config.provider))
    throw new Error('A valid configured Ollama or compatible provider is required.');
  if (!Number.isInteger(limit) || limit < 1 || limit > dataset.cases.length ||
      !Number.isInteger(budgetMs) || budgetMs < 1000 || budgetMs > 600000)
    throw new Error('Invalid semantic evaluation limits.');
  const adapter = provider ?? createHttpProvider(config);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  const rows = [];
  try {
    for (const row of selectSemanticCases(dataset, limit)) {
      if (controller.signal.aborted) {
        rows.push({ id: row.id, category: row.category, status: 'budget_exhausted' });
        continue;
      }
      try {
        // The answer under review is always the offline baseline; this run's
        // provider only judges it and cannot alter the resident response.
        const response = await answer(row.question, {
          sources: structuredClone(reliabilityDataset.fixture.sources),
          chunks: structuredClone(reliabilityDataset.fixture.chunks),
          now: reliabilityDataset.referenceDate,
          jurisdictionId: row.jurisdiction_id,
          crisisResources: structuredClone(housingDirectory.resources),
          config: parseLlmConfig({ LLM_PROVIDER: 'none' }),
        });
        const evidence = response.evidence.map(item => ({
          id: item.id, source_id: item.source_id, quote: item.quote,
        }));
        const prompt = JSON.stringify({ question: row.question, status: response.status,
          answer: response.answer, meaning: response.meaning, evidence,
          crisisPlan: response.crisisPlan ? {
            situation: response.crisisPlan.situation,
            immediatePriority: response.crisisPlan.immediatePriority,
            resourceIds: response.crisisPlan.resources.map(item => item.id),
          } : null });
        const raw = await adapter.complete({ model: config.model, signal: controller.signal,
          schema: JUDGMENT_SCHEMA, messages: [
            { role: 'system', content: 'Judge the response only against the supplied evidence and question. Do not use outside knowledge. supported means every substantive claim is supported by supplied evidence or is an explicit uncertainty/referral. relevant means the response addresses the question. uncertaintyAppropriate means it does not claim a legal, eligibility, property, or live availability determination without evidence. Return only JSON with exactly three boolean keys: supported, relevant, uncertaintyAppropriate.' },
            { role: 'user', content: prompt },
          ] });
        const judgment = parseJudgment(raw);
        rows.push({ id: row.id, category: row.category, status: 'judged', judgment,
          passed: Object.values(judgment).every(Boolean) });
      } catch {
        rows.push({ id: row.id, category: row.category, status: 'judge_error', passed: false });
      }
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  const categories = Object.fromEntries(REGRESSION_CATEGORIES.map(category => {
    const selected = rows.filter(row => row.category === category);
    const judged = selected.filter(row => row.status === 'judged');
    const passed = judged.filter(row => row.passed).length;
    return [category, { selected: selected.length, judged: judged.length,
      passed, rate: rate(passed, judged.length) }];
  }));
  const judged = rows.filter(row => row.status === 'judged');
  const passed = judged.filter(row => row.passed).length;
  return { schema_version: 1, mode: 'optional_semantic',
    generated_at: new Date().toISOString(),
    provenance: { dataset_sha256: createHash('sha256').update(JSON.stringify(dataset)).digest('hex'),
      fixture_id: reliabilityDataset.fixture.id, reference_date: reliabilityDataset.referenceDate,
      provider: publicLlmInfo(config).provider, locality: publicLlmInfo(config).locality,
      model_sha256: createHash('sha256').update(config.model).digest('hex') },
    summary: { selected: rows.length, judged: judged.length, passed,
      rate: rate(passed, judged.length), categories }, cases: rows };
}

function semanticMarkdown(report) {
  const percentage = value => value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
  const lines = ['# Optional semantic evaluation', '',
    `${report.summary.passed}/${report.summary.judged} judged cases passed (${percentage(report.summary.rate)}).`, '',
    '| Category | Judged | Passed | Pass rate |', '| --- | ---: | ---: | ---: |'];
  for (const [category, value] of Object.entries(report.summary.categories))
    lines.push(`| ${category} | ${value.judged} | ${value.passed} | ${percentage(value.rate)} |`);
  lines.push('', '## Cases needing review', '');
  const failures = report.cases.filter(row => !row.passed);
  if (failures.length) for (const row of failures)
    lines.push(`- ${row.category}/${row.id}: ${row.status === 'judged' ?
      Object.entries(row.judgment).filter(([, value]) => !value).map(([key]) => key).join(', ') : row.status}`);
  else lines.push('None.');
  lines.push('', 'Model judgments are advisory and can vary by provider and run. They do not change deterministic CI results or replace source and human review.', '');
  return lines.join('\n');
}

async function atomicWrite(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, file);
}

export async function main(args = process.argv.slice(2)) {
  const options = parseSemanticArguments(args);
  if (options.help) {
    console.log('Optional semantic evaluation: npm run eval:semantic -- --allow-provider-call [--limit 10] [--budget-ms 60000]');
    return 0;
  }
  if (!options.authorized) throw new Error('Semantic evaluation requires --allow-provider-call. It sends committed synthetic questions and responses to the configured provider and may incur costs.');
  // Validate report location before reading credentials or making any call.
  const liveRoot = resolveOutput('work/evals/semantic');
  const output = resolveOutput(options.output);
  const relative = path.relative(liveRoot, output);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Semantic reports must remain under work/evals/semantic.');
  const destination = await prepareOutputDirectory(output);
  const config = parseLlmConfig(await localEnvironment());
  if (!config.enabled || !config.valid) throw new Error('Configure a valid enabled model provider first.');
  const report = await evaluateSemantic({ config, limit: Math.min(options.limit, regressionDataset.cases.length),
    budgetMs: options.budgetMs });
  await atomicWrite(path.join(destination, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  await atomicWrite(path.join(destination, 'latest.md'), semanticMarkdown(report));
  console.log(JSON.stringify({ mode: report.mode, ...report.summary,
    output: path.relative(PROJECT_ROOT, destination).split(path.sep).join('/') }, null, 2));
  return report.cases.some(row => row.status !== 'judged') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(`Semantic evaluation configuration error: ${error.message}`);
    process.exitCode = 2;
  });
