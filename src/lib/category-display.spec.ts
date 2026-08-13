import { describe, it, expect } from "vitest";

import { resolveCategoryDisplay } from "./category-display";
import { CATEGORY_PRESETS } from "./category-presets";

type MockCategory = {
  name: string;
  description: string | null;
  systemLocaleKey: string | null;
};

describe("resolveCategoryDisplay", () => {
  // Stub translator that mimics next-intl's behavior:
  // throws for unrecognized preset keys, returns predictable strings for known keys
  const presetKeySet = new Set(CATEGORY_PRESETS.map((p) => p.key)) as Set<string>;
  const stubTranslator = (key: string) => {
    const presetKey = key.split(".")[0];
    if (!presetKeySet.has(presetKey)) {
      throw new Error(`MISSING_MESSAGE: no message for ${key}`);
    }
    return `[translated: ${key}]`;
  };

  it("returns raw name and description when systemLocaleKey is null", () => {
    const category: MockCategory = {
      name: "My Custom Category",
      description: "My custom description",
      systemLocaleKey: null,
    };

    const result = resolveCategoryDisplay(category, stubTranslator);

    expect(result.name).toBe("My Custom Category");
    expect(result.description).toBe("My custom description");
  });

  it("returns raw name and description when systemLocaleKey is null with no description", () => {
    const category: MockCategory = {
      name: "Custom Category",
      description: null,
      systemLocaleKey: null,
    };

    const result = resolveCategoryDisplay(category, stubTranslator);

    expect(result.name).toBe("Custom Category");
    expect(result.description).toBeNull();
  });

  it("returns translated text when systemLocaleKey is a valid preset key", () => {
    const category: MockCategory = {
      name: "Housing",
      description: "Rent or mortgage...",
      systemLocaleKey: "housing",
    };

    const result = resolveCategoryDisplay(category, stubTranslator);

    expect(result.name).toBe("[translated: housing.name]");
    expect(result.description).toBe("[translated: housing.description]");
  });

  it("returns translated text for all preset keys", () => {
    const presetKeys = CATEGORY_PRESETS.map((p) => p.key);

    presetKeys.forEach((key) => {
      const category: MockCategory = {
        name: "Preset Name",
        description: "Preset Description",
        systemLocaleKey: key,
      };

      const result = resolveCategoryDisplay(category, stubTranslator);

      expect(result.name).toBe(`[translated: ${key}.name]`);
      expect(result.description).toBe(`[translated: ${key}.description]`);
    });
  });

  it("falls back to raw columns when systemLocaleKey is unrecognized", () => {
    const category: MockCategory = {
      name: "Fallback Name",
      description: "Fallback Description",
      systemLocaleKey: "not-a-real-key",
    };

    const result = resolveCategoryDisplay(category, stubTranslator);

    expect(result.name).toBe("Fallback Name");
    expect(result.description).toBe("Fallback Description");
  });

  it("falls back to raw columns when systemLocaleKey is unrecognized without throwing", () => {
    const category: MockCategory = {
      name: "Fallback Name",
      description: null,
      systemLocaleKey: "unknown-preset",
    };

    // Should not throw
    expect(() => resolveCategoryDisplay(category, stubTranslator)).not.toThrow();

    const result = resolveCategoryDisplay(category, stubTranslator);
    expect(result.name).toBe("Fallback Name");
    expect(result.description).toBeNull();
  });
});
