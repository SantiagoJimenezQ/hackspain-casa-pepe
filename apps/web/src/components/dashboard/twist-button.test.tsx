import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwistButton } from "./twist-button";
import { LocaleProvider } from "@/components/i18n/locale-provider";

describe("TwistButton", () => {
  it("shows help on hover and dismisses it with Escape", async () => {
    render(<LocaleProvider><TwistButton disabled={false} onTrigger={vi.fn()} /></LocaleProvider>);
    await userEvent.hover(screen.getByRole("button", { name: "Recortar capacidad" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("¿Qué hace recortar capacidad?");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("applies the twist on a normal click", async () => {
    const onTrigger = vi.fn();
    render(<LocaleProvider><TwistButton disabled={false} onTrigger={onTrigger} /></LocaleProvider>);
    await userEvent.click(screen.getByRole("button", { name: "Recortar capacidad" }));
    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it("explains the twist on hold without applying it on release", async () => {
    const user = userEvent.setup();
    const onTrigger = vi.fn();
    render(<LocaleProvider><TwistButton disabled={false} onTrigger={onTrigger} /></LocaleProvider>);
    const button = screen.getByRole("button", { name: "Recortar capacidad" });
    await user.pointer({ keys: "[TouchA>]", target: button });
    expect(await screen.findByRole("tooltip")).toHaveTextContent("una sola unidad de cómputo");
    await user.pointer({ keys: "[/TouchA]", target: button });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("keeps help accessible when the action is unavailable", async () => {
    const onTrigger = vi.fn();
    render(<LocaleProvider><TwistButton disabled onTrigger={onTrigger} /></LocaleProvider>);
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("repriorizar sobre otra región");
    await userEvent.keyboard("{Enter}");
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("cancels a pending hold when the gesture is cancelled", async () => {
    const user = userEvent.setup();
    render(<LocaleProvider><TwistButton disabled={false} onTrigger={vi.fn()} /></LocaleProvider>);
    const button = screen.getByRole("button", { name: "Recortar capacidad" });
    await user.pointer({ keys: "[TouchA>]", target: button });
    fireEvent.pointerCancel(button);
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
