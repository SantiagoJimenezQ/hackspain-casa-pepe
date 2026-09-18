import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { renderWithProviders } from "@/test/render";

describe("ui primitives", () => {
  it("renders button variants without crashing", () => {
    renderWithProviders(
      <>
        <Button>Guardar</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost" disabled>
          Ghost
        </Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ghost" })).toBeDisabled();
  });

  it("renders form controls", async () => {
    const { user } = renderWithProviders(
      <>
        <Input aria-label="nombre" />
        <Textarea aria-label="notas" />
      </>,
    );
    await user.type(screen.getByLabelText("nombre"), "Casa Pepe");
    await user.type(screen.getByLabelText("notas"), "follow-up");
    expect(screen.getByLabelText("nombre")).toHaveValue("Casa Pepe");
    expect(screen.getByLabelText("notas")).toHaveValue("follow-up");
  });

  it("renders badge, card, progress, separator and avatar", () => {
    renderWithProviders(
      <>
        <Badge>Activo</Badge>
        <Card>
          <CardHeader>
            <CardTitle>Tarjeta</CardTitle>
          </CardHeader>
          <CardContent>Cuerpo</CardContent>
        </Card>
        <Progress value={50}>
          <span>mitad</span>
        </Progress>
        <Separator />
        <Avatar>
          <AvatarFallback>N</AvatarFallback>
        </Avatar>
      </>,
    );
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Tarjeta")).toBeInTheDocument();
    expect(screen.getByText("Cuerpo")).toBeInTheDocument();
    expect(screen.getByText("mitad")).toBeInTheDocument();
    expect(screen.getByText("N")).toBeInTheDocument();
  });
});
