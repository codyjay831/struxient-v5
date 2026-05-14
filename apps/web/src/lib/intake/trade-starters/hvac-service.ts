import { LeadChannel } from "@prisma/client";

export const HVAC_SERVICE_STARTER = {
  name: "HVAC Service",
  slug: "hvac-service",
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
        key: "hvac",
        title: "System Details",
        fields: [
          { key: "address.service" },
          { key: "request.type" },
          { key: "scope.text" },
          { key: "scope.photos" },
        ],
      },
      {
        key: "timing",
        title: "Timing",
        fields: [
          { key: "timing.bucket" },
          { key: "consent.terms" },
        ],
      },
    ],
  },
};
