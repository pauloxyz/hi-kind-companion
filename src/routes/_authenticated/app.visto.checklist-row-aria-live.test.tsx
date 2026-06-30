// @vitest-environment jsdom
//
// Travas de acessibilidade focadas exclusivamente em **como o banner do
// gate configura aria-live**. Esses testes garantem que, sempre que o
// DS-160 (ou qualquer outro passo consular) for bloqueado por falta do
// contrato, leitores de tela recebam a mesma mensagem canônica via uma
// live region polite — sem depender de foco no checkbox.
//
// Cobre 3 invariantes:
//   1. o banner expõe `role="status"` + `aria-live="polite"` + `aria-atomic="true"`
//      (a combinação canônica de live region não-disruptiva);
//   2. a mensagem renderizada cita exatamente "Oferta de trabalho aceita
//      e contrato assinado" e refere "DS-160" no contexto da row, para
//      que a explicação anunciada seja consistente entre todas as etapas
//      gated;
//   3. o banner é estável entre re-renderizações (mesmo id, mesmo texto)
//      — evita que leitores de tela anunciem duplicado ao re-fetch.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ChecklistRow } from "./app.visto";

afterEach(() => cleanup());

type Item = {
  id: string;
  step_key: string;
  step_label: string;
  sort_order: number | null;
  is_completed: boolean | null;
  event_at: string | null;
  due_at: string | null;
};

function ds160Item(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-ds160",
    step_key: "ds160",
    step_label: "Formulário DS-160 preenchido e enviado",
    sort_order: 60,
    is_completed: false,
    event_at: null,
    due_at: null,
    ...overrides,
  };
}

function renderBlockedRow(item: Partial<Item> = {}) {
  return render(
    <ChecklistRow
      item={ds160Item(item)}
      meta={undefined}
      attachments={[]}
      gateBlocked
      onToggle={vi.fn()}
      onDate={vi.fn()}
      announce={vi.fn()}
      refetchAttachments={vi.fn()}
      onOpenViewer={vi.fn()}
    />,
  );
}

describe("ChecklistRow — banner do gate como live region", () => {
  it("expõe role='status' (live region implícita polite)", () => {
    renderBlockedRow();
    const banner = screen.getByTestId("gate-banner");
    expect(banner.getAttribute("role")).toBe("status");
  });

  it("configura aria-live='polite' explicitamente", () => {
    renderBlockedRow();
    const banner = screen.getByTestId("gate-banner");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    // nunca assertive — evita interromper o screen reader do usuário.
    expect(banner.getAttribute("aria-live")).not.toBe("assertive");
  });

  it("configura aria-atomic='true' para anunciar a mensagem inteira", () => {
    renderBlockedRow();
    const banner = screen.getByTestId("gate-banner");
    expect(banner.getAttribute("aria-atomic")).toBe("true");
  });

  it("contém a frase canônica do gate (mesma mensagem para qualquer SR)", () => {
    renderBlockedRow();
    const banner = screen.getByTestId("gate-banner");
    expect(banner.textContent ?? "").toMatch(
      /Dispon[íi]vel depois que voc[êe] marcar.*Oferta de trabalho aceita e contrato assinado/i,
    );
  });

  it("o id estável do banner ('gate-<item.id>') é o destino do aria-describedby", () => {
    renderBlockedRow();
    const banner = screen.getByTestId("gate-banner");
    expect(banner.getAttribute("id")).toBe("gate-item-ds160");
    const checkbox = screen.getByRole("checkbox", { name: /Marcar etapa:/i });
    expect(checkbox.getAttribute("aria-describedby")).toBe(banner.getAttribute("id"));
  });

  it("permanece configurado como live region também no estado de drift (is_completed=true)", () => {
    // Drift: passo marcado no DB sem contrato. A UI segue bloqueada e o
    // banner mantém a mesma configuração de live region.
    renderBlockedRow({ is_completed: true });
    const banner = screen.getByTestId("gate-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.getAttribute("aria-live")).toBe("polite");
    expect(banner.getAttribute("aria-atomic")).toBe("true");
  });

  it("ícone do banner é decorativo (aria-hidden) — só o texto é anunciado", () => {
    renderBlockedRow();
    const banner = screen.getByTestId("gate-banner");
    const icon = banner.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute("aria-hidden")).not.toBeNull();
  });

  it("re-renderização com o mesmo item mantém id+texto idênticos (sem re-anúncio espúrio)", () => {
    const { rerender } = renderBlockedRow();
    const before = screen.getByTestId("gate-banner");
    const idBefore = before.getAttribute("id");
    const textBefore = (before.textContent ?? "").replace(/\s+/g, " ").trim();

    rerender(
      <ChecklistRow
        item={ds160Item()}
        meta={undefined}
        attachments={[]}
        gateBlocked
        onToggle={vi.fn()}
        onDate={vi.fn()}
        announce={vi.fn()}
        refetchAttachments={vi.fn()}
        onOpenViewer={vi.fn()}
      />,
    );
    const after = screen.getByTestId("gate-banner");
    expect(after.getAttribute("id")).toBe(idBefore);
    expect((after.textContent ?? "").replace(/\s+/g, " ").trim()).toBe(textBefore);
  });
});
