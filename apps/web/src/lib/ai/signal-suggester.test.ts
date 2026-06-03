import { describe, expect, it } from "vitest";
import { suggestCrossLineWiring } from "./signal-suggester";

describe("suggestCrossLineWiring", () => {
  it("suggests roof-prepped wiring between roofing and skylight lines", () => {
    const suggestions = suggestCrossLineWiring([
      {
        id: "line-roof",
        description: "Roofing",
        tasks: [
          {
            id: "task-prep",
            title: "Tear off and prep deck",
            category: "LABOR",
            provides: [],
            requires: [],
          },
        ],
      },
      {
        id: "line-sky",
        description: "Skylights",
        tasks: [
          {
            id: "task-install",
            title: "Install Skylights",
            category: "LABOR",
            provides: [],
            requires: [],
          },
        ],
      },
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      suggestionKey: "task-install:roof-prepped",
      signal: "roof-prepped",
      consumerTaskId: "task-install",
      providerTaskId: "task-prep",
    });
  });

  it("returns no suggestions when wiring already exists", () => {
    const suggestions = suggestCrossLineWiring([
      {
        id: "line-roof",
        description: "Roofing",
        tasks: [
          {
            id: "task-prep",
            title: "Prep roof",
            category: "LABOR",
            provides: ["roof-prepped"],
            requires: [],
          },
        ],
      },
      {
        id: "line-sky",
        description: "Skylight install",
        tasks: [
          {
            id: "task-install",
            title: "Install skylights",
            category: "LABOR",
            provides: [],
            requires: ["roof-prepped"],
          },
        ],
      },
    ]);

    expect(suggestions).toHaveLength(0);
  });
});
