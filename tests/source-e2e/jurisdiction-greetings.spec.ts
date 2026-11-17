import {test,expect} from '@playwright/test';

for(const width of [1280,375]){
  test(`initial greetings use the selected area without evidence metadata at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:812});
    for(const [area,message,label]of [['tampa','hey','Tampa'],['st-petersburg','hello','St. Petersburg'],['tampa-bay','hi','Tampa Bay']]){
      await page.goto('/');
      await page.locator('#jurisdiction').selectOption(area);
      await page.locator('#question').fill(message);await page.locator('#question').press('Enter');
      await expect(page.locator('.answer-lead')).toHaveText(`Hi! What would you like to know about ${label}?`);
      await expect(page.locator('.greeting-turn .evidence-card, .greeting-turn .status-label, .greeting-turn .verification')).toHaveCount(0);
      await expect(page.locator('#jurisdiction')).toHaveValue(area);
      await expect(page.locator('#question')).toBeFocused();
    }
  });
  test(`area changes preserve messages and factual follow-ups survive a casual turn at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:812});await page.goto('/');
    const input=page.locator('#question');let count=0;
    async function send(text:string){
      await input.fill(text);
      const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/ask'&&response.request().method()==='POST');
      await input.press('Enter');const result=await response;
      await expect(page.locator('.chat-turn')).toHaveCount(++count);return result.json();
    }
    async function area(id:string){
      const previous=await page.locator('.answer-lead').allTextContents();
      const settings=page.locator('.region-settings');
      if(await settings.count()&&!await settings.evaluate(node=>(node as HTMLDetailsElement).open))await settings.locator('summary').click();
      await page.locator('#jurisdiction').selectOption(id);
      expect(await page.locator('.answer-lead').allTextContents()).toEqual(previous);
    }
    await area('tampa');await send('hey');
    const first='Hi! What would you like to know about Tampa?';
    await area('st-petersburg');await send('hello');
    await expect(page.locator('.answer-lead').last()).toHaveText('Hi again! What else would you like to know about St. Petersburg?');
    await expect(page.locator('.answer-lead').first()).toHaveText(first);
    await area('tampa-bay');await send('hi');
    await expect(page.locator('.answer-lead').last()).toContainText('about Tampa Bay?');
    await area('st-petersburg');const permits=await send('hey, what permits are near me?');
    expect(permits.category).toBe('permitting');expect(permits.jurisdictionId).toBe('st-petersburg');
    await expect(page.locator('.chat-turn').last()).not.toHaveClass(/greeting-turn/);
    const conflict=await send('Where can I find rental assistance in Tampa?');
    expect(conflict.needsJurisdiction).toBe(true);
    await expect(page.locator('#jurisdiction')).toHaveValue('st-petersburg');
    await page.getByRole('button',{name:'New conversation',exact:true}).click();count=0;
    await area('tampa');await send('hello');
    const factual=await send('Where can I find rental assistance in Tampa?');
    expect(factual.conversation).toBeTruthy();
    const casual=await send('hey');expect(casual.conversation).toEqual(factual.conversation);
    const followup=await send('What documents do I need?');
    expect(followup.conversationUsed).toBe(true);
    expect(followup.conversation.topic).toBe('housing');
    await expect(page.locator('.answer-lead').first()).toHaveText('Hi! What would you like to know about Tampa?');
  });
}
