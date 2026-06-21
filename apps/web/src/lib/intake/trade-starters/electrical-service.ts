import { LeadChannel } from "@prisma/client";

export const ELECTRICAL_SERVICE_STARTER = {
  name: "Electrical Service",
  slug: "electrical-service",
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
        key: "service",
        title: "Service Details",
        fields: [
          { key: "address.service" },
          { key: "request.type" },
          { key: "scope.text" },
          { key: "preferred.contactMethod" },
        ],
      },
      {
        key: "timing",
        title: "Timing",
        fields: [
          { key: "timing.bucket" },
        ],
      },
    ],
  },
};
