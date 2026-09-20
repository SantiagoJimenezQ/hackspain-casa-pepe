import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TwistButton } from "./twist-button";

describe("TwistButton", () => {
  it("shows help on hover and dismisses it with Escape", async () => {
    render(<TwistButton disabled={false} onTrigger={vi.fn()} />);
    await userEvent.hover(screen.getByRole("button", { name: "Twist" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("¿Qué hace Twist?");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("applies the twist on a normal click", async () => {
    const onTrigger = vi.fn();
    render(<TwistButton disabled={false} onTrigger={onTrigger} />);
    await userEvent.click(screen.getByRole("button", { name: "Twist" }));
    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it("explains the twist on hold without applying it on release", async () => {
    const user = userEvent.setup();
    const onTrigger = vi.fn();
    render(<TwistButton disabled={false} onTrigger={onTrigger} />);
    const button = screen.getByRole("button", { name: "Twist" });
    await user.pointer({ keys: "[TouchA>]", target: button });
    expect(await screen.findByRole("tooltip")).toHaveTextContent("reduce la capacidad disponible");
    await user.pointer({ keys: "[/TouchA]", target: button });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("keeps help accessible when the action is unavailable", async () => {
    const onTrigger = vi.fn();
    render(<TwistButton disabled onTrigger={onTrigger} />);
    await userEvent.tab();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("adaptar el plan");
    await userEvent.keyboard("{Enter}");
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("cancels a pending hold when the gesture is cancelled", async () => {
    const user = userEvent.setup();
    render(<TwistButton disabled={false} onTrigger={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Twist" });
    await user.pointer({ keys: "[TouchA>]", target: button });
    fireEvent.pointerCancel(button);
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
