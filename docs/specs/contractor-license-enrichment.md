# Feature Spec: Contractor License Auto-fill & Enrichment

## Overview
This feature allows users to enter a Contractor License Number and State to automatically populate company information, contact details, and brand assets (logo). Instead of relying on niche, often unreliable contractor APIs, this implementation uses an "AI Search & Scrape" approach to gather data directly from official state registries and Google Maps.

## User Story
As a staff member creating a new Lead or Company, I want to enter a license number so that I don't have to manually type in the company name, address, and website, and so that the company's logo is automatically added to their profile.

## Technical Architecture: The "AI Search" Loop

### 1. Discovery Phase (Web Search)
- **Input:** `license_number`, `state`.
- **Action:** Execute a targeted web search using a search API (e.g., Serper.dev, Tavily, or Exa).
- **Query Pattern:** `site:[state_registry_domain] "License #[license_number]"` or `"[state] contractor license [license_number] lookup"`.
- **Target:** Find the official URL for that specific license on the state's registry (e.g., CSLB in CA, DBPR in FL).

### 2. Extraction Phase (Scrape & LLM)
- **Action:** Scrape the content of the discovered URL using a tool like **Firecrawl** or **Jina Reader** to get clean Markdown/Text.
- **LLM Processing:** Pass the text to an LLM (Gemini 3 Flash or Claude 3.5 Sonnet) with a structured prompt.
- **Prompt Goal:** "Extract the following fields into JSON: Legal Name, Doing Business As (DBA), Primary Address, License Status, Expiration Date, and Primary Classification."

### 3. Enrichment Phase (Google Maps & Branding)
- **Action:** Use the **Google Places API** (Find Place from Query) using the extracted "Legal Name" and "City/State".
- **Data Points:** Retrieve Google Place ID, Phone Number, Website URL, and Google Rating.
- **Logo Retrieval:** Use the **Clearbit Logo API** (e.g., `https://logo.clearbit.com/[domain]`) using the website found via Google Maps.

## Implementation Plan

### Phase 1: Server Action
Create a Next.js Server Action `enrichLeadFromLicenseAction` in `apps/web/src/app/(workspace)/leads/lead-form-actions.ts`:
1. Validate input (License # and State).
2. Call Search API -> Scrape -> LLM.
3. Call Google Places API for verification.
4. Return a unified "Enrichment Result" object.

### Phase 2: UI Integration
Update `apps/web/src/app/(workspace)/leads/lead-record-form.tsx`:
1. Add a "Contractor License" input group (License # and State dropdown).
2. Add a "Verify & Auto-fill" button with a loading state.
3. On success, use React state to populate the `companyName`, `address`, `phone`, and `email` (if found) fields.
4. Show a "Verified" badge next to the company name.

### Phase 3: Storage
1. Update the `Lead` or `Company` schema to store the `licenseNumber` and `licenseState`.
2. Store the logo URL in the company profile.

### Phase 4: Marketplace Vetting (Bid Responses)
When a contractor responds to a bid request, the system triggers an automatic verification loop:
1. **Gatekeeping:** Auto-verify the responder's license status before their bid is shown to the requester.
2. **Trust Badges:** Display "Active License," "Bonded," and "Insured" badges on the bid response based on real-time state registry data.
3. **Safety Invariants:** Allow requesters to set minimum verification requirements (e.g., "Only show bids from contractors with an Active license and Workers' Comp").

### Phase 5: Deep Search (Due Diligence)
For high-value partnerships, provide a "Deep Search" report that goes beyond basic license info:
1. **Risk Assessment:** Scrape public records for OSHA violations, liens, or legal disputes using the legal entity name.
2. **Reputation Sentiment:** Use LLMs to summarize Google Reviews, Yelp, and BBB ratings into a "Pro/Con" summary.
3. **Project Verification:** Discover and verify past project photos from the web to confirm expertise in specific trades (e.g., "Verified 5+ commercial roofing projects in the last 2 years").

## Required API Keys
- `SERPER_API_KEY` (or Tavily) - For web search.
- `FIRECRAWL_API_KEY` - For clean scraping.
- `GOOGLE_MAPS_API_KEY` - For Places lookup (already partially in use).
- `GEMINI_API_KEY` - For data extraction.

## Fallback Logic
- If the license is not found on the state registry, notify the user and allow manual entry.
- If Google Maps find multiple matches, show a selection dialog to the user to pick the correct business profile.
- If the logo cannot be found, fallback to a generic company icon.
