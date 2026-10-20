/** Shared copy for the static Pages privacy page and the local Next route. */
export const privacyIntroduction =
  "This page describes the TampaBayBot preview code reviewed in October 2026. Available tools vary by deployment, and a repository change does not verify what is running on the hosted site. Please avoid entering names, account numbers, case numbers, or other sensitive details.";

export type PrivacySection = {
  id: string;
  title: string;
  paragraphs: readonly string[];
  points?: readonly string[];
};

export const privacySections: readonly PrivacySection[] = [
  {
    id: "information-you-provide",
    title: "Information you provide",
    paragraphs: [
      "You can browse public housing contacts without an account. The optional housing guide asks for broad choices about your situation, timing, location, and safety; you can skip its questions. Directory filters use your selected category and location.",
      "Where available, the question form accepts your question or address and a selected area. Property search accepts a street address; choosing a match uses its address and coordinates, and development search uses a selected radius. The preview does not ask you to upload documents.",
    ],
  },
  {
    id: "housing-guide",
    title: "Housing guide and public resources",
    paragraphs: [
      "The housing-crisis guide applies fixed rules in your browser to its selections and builds a plan there. Its selections and plan are held in page memory; the guide does not send them to an application endpoint or write them to browser local or session storage. Browsing and filtering the included resource directory also happens in the page.",
      "Copying a plan, saving a text file, or printing can leave a copy on your device, clipboard, printer, or shared computer. Quick exit opens another website but cannot erase browser history. Opening a resource link takes you to another website with its own practices.",
    ],
  },
  {
    id: "questions-and-ai",
    title: "Questions and optional AI",
    paragraphs: [
      "When the question form is available, submitting it sends the current question, selected area, and a short topic/area/source context token to TampaBayBot's backend. That token contains no prior question text, address, or model response. In the hosted Pages preview, a Pages Function forwards the request through a service binding to a Worker. The page keeps displayed turns in memory while it is open. A source-based response or an unavailable message may appear when a model cannot be used. On the hosted preview, the question path is not device-local even when model assistance is off.",
      "If an operator enables a model and the answer is eligible, the backend may send the current question and selected public-source excerpts to the configured model service. It does not send raw prior conversation turns or the whole source library to the model. The question is not automatically redacted before transfer. The deterministic housing guide does not use this path. The static Pages form cannot independently confirm which model, if any, is enabled on a hosted backend.",
    ],
  },
  {
    id: "what-local-means",
    title: "What stays on this page",
    paragraphs: [
      "The housing guide and directory filters run on your device after the page loads. That does not make the hosted Pages preview offline or private from its host: Cloudflare receives the page request, and outside sites receive traffic when you open their links. The hosted question and property tools use the backend and are not device-local.",
      "An operator can run the app and an Ollama model on the same computer for local development. A hosted Pages preview cannot use a visitor's local model through the visitor's browser. A configured remote model, including Cloudflare Workers AI, processes eligible questions outside the visitor's device; a local model daemon may also forward work depending on its own settings.",
    ],
  },
  {
    id: "address-and-property",
    title: "Address and property searches",
    paragraphs: [
      "An address lookup sends the entered address through the API to configured public city or county geocoding services. After you choose a suggested match, the selected address and coordinates go to property and development endpoints, which consult public GIS and agency data. These services can receive the search information needed to answer the request.",
      "The classic interface also offers an optional map. Opening that map sends selected coordinates to OpenStreetMap. Public property records may be incomplete or out of date; a match is not an official property determination.",
    ],
  },
  {
    id: "storage-and-logging",
    title: "Storage, caches, and logging",
    paragraphs: [
      "The inspected application code does not save guide selections, question text, conversation history, or street addresses in browser local or session storage or in its application database. The operational database keeps rotating keyed client identifiers, usage counters, and aggregate metrics; it does not store raw client IP addresses or those text fields. API responses are marked not to be stored by HTTP caches.",
      "An address request can be held briefly in a Worker memory cache used for geocoding. Expired operational rows are removed during later requests or monitoring, so the retention target is not an immediate-deletion promise. Cloudflare hosting, public GIS services, optional model providers, and network intermediaries may have separate logs or transient caches. Their retention settings have not been verified for the hosted preview. Do not assume a request is confidential or immediately erased.",
    ],
  },
  {
    id: "outside-services",
    title: "Outside services and links",
    paragraphs: [
      "Cloudflare Pages and Workers handle site and API traffic. Public government and GIS services handle address and property requests. An AI provider only receives a question when configured and used for that request. If you follow an agency link, use a phone link, or open the optional map, you interact with that outside service directly. Check its privacy information before sharing sensitive details.",
    ],
  },
  {
    id: "preview-limits",
    title: "Limits of this preview",
    paragraphs: [
      "TampaBayBot is independent and unofficial. This preview is intended for review and collaboration; it has not been certified for unrestricted resident use. It cannot provide emergency response, legal advice, eligibility decisions, or guaranteed shelter availability. Verify current details with the responsible agency.",
      "These statements describe inspected source code, not a completed audit of the live deployment or of outside providers. Hosting configuration, logging, AI availability, and deployed version need separate verification. We cannot promise complete confidentiality, a universal retention period, or production readiness.",
    ],
  },
];
