// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renderiza <header> semântico", () => {
    const { container } = render(<PageHeader title="Vagas" />);
    expect(container.querySelector("header")).not.toBeNull();
  });

  it("renderiza o título como h1 único", () => {
    render(<PageHeader title="Vagas H-2A" />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe("Vagas H-2A");
  });

  it("renderiza descrição quando fornecida", () => {
    render(<PageHeader title="Painel" description="Acompanhe sua jornada." />);
    expect(screen.getByText("Acompanhe sua jornada.")).toBeTruthy();
  });

  it("não renderiza parágrafo de descrição quando ausente", () => {
    const { container } = render(<PageHeader title="Sem descrição" />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("renderiza ações no slot actions", () => {
    render(
      <PageHeader
        title="Candidaturas"
        actions={<button type="button">Exportar CSV</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeTruthy();
  });

  it("aplica font-display e text-balance no h1", () => {
    render(<PageHeader title="Auditoria" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toMatch(/font-display/);
    expect(h1.className).toMatch(/text-balance/);
  });

  it("aceita ReactNode no title (spans aninhados)", () => {
    render(
      <PageHeader
        title={<>Currículo <span data-testid="suffix">(H-2A)</span></>}
      />,
    );
    expect(screen.getByTestId("suffix").textContent).toBe("(H-2A)");
  });

  it("marca o wrapper do ícone como aria-hidden", () => {
    render(
      <PageHeader title="Auditoria" icon={<svg data-testid="ico" />} />,
    );
    const wrapper = screen.getByTestId("ico").parentElement;
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renderiza eyebrow quando fornecido", () => {
    render(<PageHeader title="Painel" eyebrow="Fase atual" />);
    expect(screen.getByText("Fase atual")).toBeTruthy();
  });
});
