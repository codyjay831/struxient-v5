import { LeadChannel } from "@prisma/client";

export const PLUMBING_EMERGENCY_STARTER = {
  name: "Plumbing Emergency",
  slug: "plumbing-emergency",
  channel: LeadChannel.WEB_FORM,
  isPublic: true,
  schema: {
    sections: [
      {
        key: "contact",
        title: "Contact Info",
        fields: [
          { key: "contact.name" },
          { key: "contact.phone" },
          { key: "contact.email" },
        ],
      },
      {
        key: "emergency",
        title: "Emergency Details",
        fields: [
          { key: "address.service" },
          { key: "scope.text" },
          { key: "scope.photos" },
        ],
      },
      {
        key: "timing",
        title: "Timing",
        fields: [
          { key: "timing.bucket" },
          { 
            key: "timing.specificDate", 
            visibleIf: { fieldKey: "timing.bucket", equals: "SPECIFIC_DATE" } 
          },
        ],
      },
    ],
  },
};
