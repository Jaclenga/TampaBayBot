/** Shared copy for the static Pages privacy page and the local Next route. */
export const privacyIntroduction =
  "This page describes the TampaBayBot preview code reviewed for October 2026. Available tools vary by deployment, and a repository change does not verify what is running on the hosted site. Please avoid entering names, account numbers, case numbers, or other sensitive details.";

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
      "Copying a plan, saving a text file, or printing can leave a copy on your device, clipboard, printer, or shared computer. Opening a resource link takes you to another website with its own practices.",
    ],
  },
  {
    id: "questions-and-ai",
    title: "Questions and optional AI",
    paragraphs: [
      "When the question form is available, submitting it sends the current question, selected area, and limited conversation context to TampaBayBot's API through the hosting service. The page keeps displayed turns in memory while it is open. A source-based response or an unavailable message may appear when AI cannot be used.",
      "If an operator enables an AI model and a request is eligible, the backend may send the current question and selected public-source excerpts to that model provider. The question is not automatically redacted before this transfer. The deterministic housing guide does not use this AI path. AI availability in one deployment does not establish its status in another.",
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
      "The inspected application code does not save guide selections, question text, conversation history, or street addresses in browser local or session storage or in its application database. The operational database keeps keyed usage controls and aggregate service metrics without those text fields. API responses are marked not to be stored by HTTP caches.",
      "An address request can be held briefly in a Worker memory cache used for geocoding. Cloudflare hosting, public GIS services, optional model providers, and other network intermediaries may have their own logs or transient caches. Their retention settings are outside this application's code and have not been verified for the hosted preview. Do not assume a request is confidential or immediately erased.",
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
