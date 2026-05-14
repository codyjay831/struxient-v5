# Intake Form Style Guide

This document defines the conventions for building high-quality intake forms in Struxient.

## Field Naming Conventions

- **System Atoms**: Always use the blessed system atom keys (e.g., `contact.name`, `address.service`).
- **Custom Fields**: Use `kebab-case` for keys. Be descriptive but concise.
- **Labels**: Use Sentence case for labels (e.g., "What is the age of your roof?" not "WHAT IS THE AGE OF YOUR ROOF?").

## Max Field Counts

To ensure high conversion rates, keep forms focused:
- **Total Fields**: Max 40 fields per form.
- **Sections**: Max 8 sections.
- **Per Section**: Aim for 3-7 fields per section.

## Controlled Vocabulary

Use consistent terminology across trades:
- **Service Address**: Not "Job Site", "Work Location", or "Site Address".
- **Request Details**: Not "Notes", "Description", or "Problem".

## Trade-Specific Best Practices

### Plumbing
- Always include `timing.bucket` to triage emergencies vs. routine service.
- Use `scope.photos` to allow customers to show the leak/fixture.

### Roofing
- Use `request.type` to distinguish between Repair, Replacement, and New Construction.
- Include `visit.requestedDate` to streamline estimate scheduling.

### Electrical
- Ask for `preferred.contactMethod` as electrical issues often require immediate phone coordination.

### HVAC
- Use `scope.photos` for unit nameplates and installation locations.
- Include `consent.terms` for maintenance agreement disclosures.
