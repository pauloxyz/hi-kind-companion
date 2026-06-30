// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { PageHeader } from "./page-header";

afterEach(() => cleanup());

describe("PageHeader — acessibilidade", () => {
  it("o wrapper do ícone tem aria-hidden=true e o SVG não é acessível por nome", () => {
    render(
      <PageHeader
        title="Auditoria"
        icon={<svg data-testid="ico" role="img" aria-label="Escudo" />}
      />,
    );
    const wrapper = screen.getByTestId("ico").parentElement;
    expect(wrapper?.tagName.toLowerCase()).toBe("span");
    expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
  });

  it("ações com botão expõem nome acessível", () => {
    render(
      <PageHeader
        title="Candidaturas"
        actions={
          <button type="button" aria-label="Exportar histórico em CSV">
            <svg aria-hidden="true" />
          </button>
        }
      />,
    );
    expect(
      screen.getByRole("button", { name: "Exportar histórico em CSV" }),
    ).toBeTruthy();
  });

  it("link no slot actions tem nome acessível mesmo só com ícone + label", () => {
    render(
      <PageHeader
        title="E-mails"
        actions={
          <a href="/app/admin/emails/preview" aria-label="Abrir preview dos lembretes">
            <svg aria-hidden="true" />
          </a>
        }
      />,
    );
    expect(
      screen.getByRole("link", { name: "Abrir preview dos lembretes" }),
    ).toBeTruthy();
  });

  it("eyebrow não compete com h1 (não cria heading adicional)", () => {
    render(<PageHeader title="Painel" eyebrow="Fase atual" />);
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Painel");
  });

  it("header semântico contém o h1 (estrutura de landmark correta)", () => {
    const { container } = render(<PageHeader title="Vagas" />);
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(within(header!).getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
