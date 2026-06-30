import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("renderiza <header> semântico com role banner implícito", () => {
    const { container } = render(<PageHeader title="Vagas" />);
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
  });

  it("renderiza o título como h1 único", () => {
    render(<PageHeader title="Vagas H-2A" />);
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Vagas H-2A");
  });

  it("renderiza descrição quando fornecida", () => {
    render(<PageHeader title="Painel" description="Acompanhe sua jornada." />);
    expect(screen.getByText("Acompanhe sua jornada.")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeInTheDocument();
  });

  it("aplica font-display ao h1 (classe presente)", () => {
    render(<PageHeader title="Auditoria" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toMatch(/font-display/);
    expect(h1.className).toMatch(/text-balance/);
  });

  it("aceita ReactNode no title (ex.: spans aninhados)", () => {
    render(
      <PageHeader
        title={<>Currículo <span data-testid="suffix">(H-2A)</span></>}
      />,
    );
    expect(screen.getByTestId("suffix")).toHaveTextContent("(H-2A)");
  });

  it("renderiza ícone marcado como aria-hidden", () => {
    render(
      <PageHeader
        title="Auditoria"
        icon={<svg data-testid="ico" />}
      />,
    );
    expect(screen.getByTestId("ico")).toBeInTheDocument();
    // O wrapper do ícone deve ser aria-hidden
    const wrapper = screen.getByTestId("ico").parentElement;
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renderiza eyebrow acima do título quando fornecido", () => {
    render(<PageHeader title="Painel" eyebrow="Fase atual" />);
    expect(screen.getByText("Fase atual")).toBeInTheDocument();
  });
});
