import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GlassPanel, glassPanelVariants } from "@/components/ui/glass-panel";

describe("Story 5.2: GlassPanel Component", () => {
  const variants = ["sidebar", "overlay", "settings", "toast", "filter"] as const;

  it("renders a div with data-slot='glass-panel'", () => {
    render(<GlassPanel data-testid="gp">content</GlassPanel>);
    const el = screen.getByTestId("gp");
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveAttribute("data-slot", "glass-panel");
  });

  it.each(variants)("applies variant=%s classes", (variant) => {
    render(
      <GlassPanel variant={variant} data-testid={`gp-${variant}`}>
        {variant}
      </GlassPanel>,
    );
    const el = screen.getByTestId(`gp-${variant}`);
    expect(el).toHaveAttribute("data-variant", variant);
    expect(el.className).toContain("backdrop-blur");
    expect(el.className).toContain("border");
  });

  it("applies sidebar variant backdrop-blur-[20px]", () => {
    render(<GlassPanel variant="sidebar" data-testid="s">x</GlassPanel>);
    expect(screen.getByTestId("s").className).toContain("backdrop-blur-[20px]");
  });

  it("applies overlay variant backdrop-blur-[40px]", () => {
    render(<GlassPanel variant="overlay" data-testid="o">x</GlassPanel>);
    expect(screen.getByTestId("o").className).toContain("backdrop-blur-[40px]");
  });

  it("applies settings variant backdrop-blur-[24px]", () => {
    render(<GlassPanel variant="settings" data-testid="st">x</GlassPanel>);
    expect(screen.getByTestId("st").className).toContain("backdrop-blur-[24px]");
  });

  it("applies toast variant backdrop-blur-[16px]", () => {
    render(<GlassPanel variant="toast" data-testid="t">x</GlassPanel>);
    expect(screen.getByTestId("t").className).toContain("backdrop-blur-[16px]");
  });

  it("applies filter variant backdrop-blur-[12px]", () => {
    render(<GlassPanel variant="filter" data-testid="f">x</GlassPanel>);
    expect(screen.getByTestId("f").className).toContain("backdrop-blur-[12px]");
  });

  it("always includes glass border styling class", () => {
    render(<GlassPanel data-testid="b">x</GlassPanel>);
    expect(screen.getByTestId("b").className).toContain("border");
  });

  it("merges custom className", () => {
    render(
      <GlassPanel className="my-custom" data-testid="c">
        x
      </GlassPanel>,
    );
    expect(screen.getByTestId("c").className).toContain("my-custom");
  });

  it("forwards ref", () => {
    let ref: HTMLDivElement | null = null;
    render(
      <GlassPanel ref={(el) => { ref = el; }}>x</GlassPanel>,
    );
    expect(ref).toBeInstanceOf(HTMLDivElement);
  });

  it("exports glassPanelVariants for composability", () => {
    expect(typeof glassPanelVariants).toBe("function");
    const classes = glassPanelVariants({ variant: "overlay" });
    expect(classes).toContain("backdrop-blur-[40px]");
  });
});
