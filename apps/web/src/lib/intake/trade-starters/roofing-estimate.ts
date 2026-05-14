import { LeadChannel } from "@prisma/client";

export const ROOFING_ESTIMATE_STARTER = {
  name: "Roofing Estimate",
  slug: "roofing-estimate",
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
        key: "roof",
        title: "Roof Details",
        fields: [
          { key: "address.service" },
          { key: "request.type" },
          { key: "scope.text" },
          { key: "scope.photos" },
        ],
      },
      {
        key: "visit",
        title: "Schedule a Visit",
        fields: [
          { key: "visit.requestedDate" },
          { key: "visit.window" },
          { key: "visit.notes" },
        ],
      },
    ],
  },
};
