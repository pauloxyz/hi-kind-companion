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

/**
 * Texto canônico do banner. Esta string é a "fonte da verdade" da
 * explicação anunciada por leitores de tela. Qualquer divergência aqui
 * quebra o contrato com o usuário — por isso fica em uma constante
 * compartilhada entre os asserts.
 */
const CANONICAL_BANNER_TEXT =
  "Disponível depois que você marcar \u201COferta de trabalho aceita e contrato assinado\u201D acima.";

function normalize(s: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

describe("ChecklistRow — texto canônico do banner e aria-describedby determinístico", () => {
  it("renderiza EXATAMENTE o texto canônico (normalizado)", () => {
    renderBlockedRow();
    const banner = screen.getByTestId("gate-banner");
    expect(normalize(banner.textContent)).toBe(CANONICAL_BANNER_TEXT);
  });

  it("preserva as aspas tipográficas curvas (\u201C \u201D) ao redor da frase de ação", () => {
    renderBlockedRow();
    const banner = screen.getByTestId("gate-banner");
    const txt = normalize(banner.textContent);
    expect(txt).toContain("\u201COferta de trabalho aceita e contrato assinado\u201D");
    // Nunca aspas retas " (regressão comum em copy/paste).
    expect(txt).not.toContain('"Oferta de trabalho');
  });

  it("destaca a frase de ação em <strong> (ênfase semântica, não só visual)", () => {
    renderBlockedRow();
    const banner = screen.getByTestId("gate-banner");
    const strong = banner.querySelector("strong");
    expect(strong, "banner precisa ter <strong> com a frase de ação").not.toBeNull();
    expect(normalize(strong!.textContent)).toBe(
      "\u201COferta de trabalho aceita e contrato assinado\u201D",
    );
  });

  it("aria-describedby do checkbox resolve para um elemento com o texto canônico", () => {
    const { container } = renderBlockedRow();
    const checkbox = screen.getByRole("checkbox", { name: /Marcar etapa:/i });
    const describedById = checkbox.getAttribute("aria-describedby");
    expect(describedById, "aria-describedby deve estar definido").toBeTruthy();

    const target = container.ownerDocument.getElementById(describedById!);
    expect(target, "elemento referenciado por aria-describedby deve existir").not.toBeNull();
    expect(target).toBe(screen.getByTestId("gate-banner"));
    expect(normalize(target!.textContent)).toBe(CANONICAL_BANNER_TEXT);
  });

  it("a relação id ↔ aria-describedby é determinística e baseada no item.id", () => {
    cleanup();
    render(
      <ChecklistRow
        item={ds160Item({ id: "alpha" })}
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
    const cbAlpha = screen.getByRole("checkbox", { name: /Marcar etapa:/i });
    expect(cbAlpha.getAttribute("aria-describedby")).toBe("gate-alpha");
    expect(document.getElementById("gate-alpha")).not.toBeNull();

    cleanup();
    render(
      <ChecklistRow
        item={ds160Item({ id: "beta" })}
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
    const cbBeta = screen.getByRole("checkbox", { name: /Marcar etapa:/i });
    expect(cbBeta.getAttribute("aria-describedby")).toBe("gate-beta");
    expect(document.getElementById("gate-beta")).not.toBeNull();
    expect(document.getElementById("gate-alpha")).toBeNull();
  });

  it("o texto resolvido por aria-describedby é IGUAL entre estado fresco e drift", () => {
    const { rerender } = renderBlockedRow();
    const fresh = normalize(screen.getByTestId("gate-banner").textContent);

    rerender(
      <ChecklistRow
        item={ds160Item({ is_completed: true })}
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
    const drift = normalize(screen.getByTestId("gate-banner").textContent);
    expect(drift).toBe(fresh);
    expect(drift).toBe(CANONICAL_BANNER_TEXT);
  });
});
