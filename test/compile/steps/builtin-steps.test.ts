import { describe, expect, it } from "vitest";

import { AddFrontmatterStep } from "../../../src/compile/steps/add-frontmatter";
import {
  CompileStepKind,
  makeBuiltinStep,
  type CompileContext,
  type CompileSceneInput,
} from "../../../src/compile/steps/abstract-compile-step";
import { ConcatenateTextStep } from "../../../src/compile/steps/concatenate-text";
import { PrependTitleStep } from "../../../src/compile/steps/prepend-title";
import { RemoveCommentsStep } from "../../../src/compile/steps/remove-comments";
import { RemoveStrikethroughsStep } from "../../../src/compile/steps/remove-strikethroughs";
import { StripFrontmatterStep } from "../../../src/compile/steps/strip-frontmatter";

function context(
  kind: CompileStepKind,
  optionValues: Record<string, unknown> = {}
): CompileContext {
  return {
    kind,
    optionValues,
    projectPath: "Books/My/Book.md",
    draft: {} as any,
    app: {} as any,
    utilities: { normalizePath: (path) => path },
  };
}

function scene(name: string, contents: string): CompileSceneInput {
  return {
    path: `Books/My/Scenes/${name}.md`,
    name,
    contents,
    metadata: {} as any,
  };
}

function compileScenes(
  step: typeof PrependTitleStep,
  scenes: CompileSceneInput[],
  optionValues: Record<string, unknown>
): CompileSceneInput[] {
  return step.compile(scenes, context(CompileStepKind.Scene, optionValues)) as
    CompileSceneInput[];
}

describe("PrependTitleStep", () => {
  it("uses the default title format and separator", () => {
    const scenes = [scene("Scene One", "Body")];
    const compiled = compileScenes(
      PrependTitleStep,
      scenes,
      PrependTitleStep.optionValues
    );

    expect(compiled[0].contents).toBe("Scene One\n\nBody");
    expect(compiled[0].path).toBe("Books/My/Scenes/Scene One.md");
    expect(scenes[0].contents).toBe("Body");
  });

  it("substitutes the scene number and repeats based on indent", () => {
    const scenes: CompileSceneInput[] = [
      {
        ...scene("Scene One", "Body"),
        numbering: [1, 2],
        indentationLevel: 2,
      },
      {
        ...scene("Scene Two", "Text"),
        numbering: [2],
        indentationLevel: 0,
      },
    ];

    const compiled = compileScenes(PrependTitleStep, scenes, {
      format: "$3{#} $1 ($2)",
      separator: "\n",
    });

    expect(compiled[0].contents).toBe("### Scene One (1.2)\nBody");
    expect(compiled[1].contents).toBe("# Scene Two (2)\nText");
  });

  it("leaves the number placeholder alone when numbering is absent", () => {
    const compiled = compileScenes(
      PrependTitleStep,
      [scene("Scene One", "Body")],
      { format: "$1-$2", separator: " " }
    );

    expect(compiled[0].contents).toBe("Scene One-$2 Body");
  });
});

describe("StripFrontmatterStep", () => {
  const source = "---\ntitle: Scene\ntags: [one]\n---\nBody text";

  it("strips frontmatter from every scene", () => {
    const scenes = [scene("One", source), scene("Two", "No frontmatter")];
    const compiled = StripFrontmatterStep.compile(
      scenes,
      context(CompileStepKind.Scene)
    ) as CompileSceneInput[];

    // The newline that followed the closing delimiter is retained.
    expect(compiled.map((item) => item.contents)).toEqual([
      "\nBody text",
      "No frontmatter",
    ]);
    expect(scenes[0].contents).toBe(source);
  });

  it("strips frontmatter from a manuscript", () => {
    expect(
      (
        StripFrontmatterStep.compile(
          { contents: source },
          context(CompileStepKind.Manuscript)
        ) as { contents: string }
      ).contents
    ).toBe("\nBody text");
  });
});

describe("RemoveCommentsStep", () => {
  const contents = "A %%markdown%% B <!--html--> C";

  it("removes both comment styles by default", () => {
    const compiled = RemoveCommentsStep.compile(
      [scene("One", contents)],
      context(CompileStepKind.Scene, {
        "remove-markdown-comments": true,
        "remove-html-comments": true,
      })
    ) as CompileSceneInput[];

    expect(compiled[0].contents).toBe("A  B  C");
  });

  it("obeys each toggle independently", () => {
    const markdownOnly = RemoveCommentsStep.compile(
      { contents },
      context(CompileStepKind.Manuscript, {
        "remove-markdown-comments": true,
        "remove-html-comments": false,
      })
    ) as { contents: string };
    expect(markdownOnly.contents).toBe("A  B <!--html--> C");

    const htmlOnly = RemoveCommentsStep.compile(
      { contents },
      context(CompileStepKind.Manuscript, {
        "remove-markdown-comments": false,
        "remove-html-comments": true,
      })
    ) as { contents: string };
    expect(htmlOnly.contents).toBe("A %%markdown%% B  C");
  });

  it("removes multi-line comments", () => {
    const compiled = RemoveCommentsStep.compile(
      { contents: "before\n%%one\ntwo%%\nafter" },
      context(CompileStepKind.Manuscript, {
        "remove-markdown-comments": true,
        "remove-html-comments": true,
      })
    ) as { contents: string };

    expect(compiled.contents).toBe("before\n\nafter");
  });
});

describe("RemoveStrikethroughsStep", () => {
  it("removes struck-through text from scenes and manuscripts", () => {
    const scenes = RemoveStrikethroughsStep.compile(
      [scene("One", "~~gone~~ keep")],
      context(CompileStepKind.Scene)
    ) as CompileSceneInput[];
    expect(scenes[0].contents).toBe(" keep");

    const manuscript = RemoveStrikethroughsStep.compile(
      { contents: "keep ~~gone~~ end" },
      context(CompileStepKind.Manuscript)
    ) as { contents: string };
    expect(manuscript.contents).toBe("keep  end");
  });
});

describe("ConcatenateTextStep", () => {
  it("joins scenes with the configured separator", () => {
    const scenes = [scene("One", "A"), scene("Two", "B")];

    expect(
      (
        ConcatenateTextStep.compile(
          scenes,
          context(CompileStepKind.Join, {
            separator: ConcatenateTextStep.optionValues["separator"],
          })
        ) as { contents: string }
      ).contents
    ).toBe("A\n\nB");

    expect(
      (
        ConcatenateTextStep.compile(
          scenes,
          context(CompileStepKind.Join, { separator: " | " })
        ) as { contents: string }
      ).contents
    ).toBe("A | B");
  });

  it("rejects non-array input", () => {
    expect(() =>
      ConcatenateTextStep.compile(
        { contents: "A" },
        context(CompileStepKind.Join, { separator: "\n" })
      )
    ).toThrow(/string\[\]/);
  });
});

describe("AddFrontmatterStep", () => {
  it("prepends a YAML block", () => {
    expect(
      (
        AddFrontmatterStep.compile(
          { contents: "Body" },
          context(CompileStepKind.Manuscript, {
            frontmatter: "title: Book\ntags: [novel]",
          })
        ) as { contents: string }
      ).contents
    ).toBe("---\ntitle: Book\ntags: [novel]\n---\nBody");
  });

  it("rejects non-manuscript input", () => {
    expect(() =>
      AddFrontmatterStep.compile(
        { contents: "Body" },
        context(CompileStepKind.Scene)
      )
    ).toThrow();
  });
});

describe("makeBuiltinStep", () => {
  it("fills in IDs, defaults, and script metadata", () => {
    const step = makeBuiltinStep(
      {
        id: "test-step",
        description: {
          name: "Test",
          description: "A test step.",
          availableKinds: [CompileStepKind.Scene],
          options: [
            {
              id: "text",
              name: "Text",
              description: "",
              type: 0,
              default: "default value",
            },
            {
              id: "flag",
              name: "Flag",
              description: "",
              type: 0,
              default: false,
            },
          ],
        },
        compile: (input) => input,
      },
      true
    );

    expect(step.description.canonicalID).toBe("test-step");
    expect(step.description.isScript).toBe(true);
    expect(step.optionValues).toEqual({
      text: "default value",
      flag: false,
    });
  });
});
