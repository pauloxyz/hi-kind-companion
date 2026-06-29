import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { brand, styles } from "./_brand";
import type { TemplateEntry } from "./registry";

interface VisaReminderProps {
  recipientName?: string;
  stepLabel?: string;
  daysUntil?: number;
  dueDate?: string; // ISO or pt-BR formatted
  checklistUrl?: string;
}

const tone = (days: number) => {
  if (days <= 1) return { color: brand.red, label: "URGENTE — vence em 1 dia" };
  if (days <= 7) return { color: brand.ochre, label: `Atenção — faltam ${days} dias` };
  return { color: brand.primary, label: `Lembrete — em ${days} dias` };
};

export const VisaReminderEmail = ({
  recipientName,
  stepLabel = "Próxima etapa do seu visto",
  daysUntil = 7,
  dueDate,
  checklistUrl = "https://vplusa.com/app/visto",
}: VisaReminderProps) => {
  const t = tone(daysUntil);
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{t.label}: {stepLabel}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={{ ...styles.band, backgroundColor: t.color }} />
          <Section style={styles.header}>
            <Text style={styles.brandLine}>V+ USA</Text>
            <Text style={{ ...styles.brandTag, color: t.color }}>{t.label}</Text>
          </Section>
          <Section style={styles.body}>
            <Heading style={styles.h1}>
              {recipientName ? `Oi, ${recipientName}!` : "Oi!"} Sua próxima etapa H-2A está chegando
            </Heading>
            <Text style={styles.text}>
              <strong>{stepLabel}</strong>
              {dueDate ? ` — prazo: ${dueDate}` : ""}.
            </Text>
            <Text style={styles.text}>
              Vai com calma e siga o passo a passo do checklist. Quanto antes
              você concluir, mais tranquilo fica para a entrevista no consulado.
            </Text>
            <Button
              style={{ ...styles.button, backgroundColor: t.color }}
              href={checklistUrl}
            >
              Abrir meu checklist
            </Button>
            <Text style={{ ...styles.text, fontSize: "13px", color: brand.muted }}>
              Dica: marque como concluído ou anexe a evidência diretamente no
              checklist. Assim você nunca esquece um documento.
            </Text>
            <div style={styles.divider} />
          </Section>
          <Text style={styles.footer}>
            Você está recebendo este lembrete porque tem uma etapa do visto H-2A
            com data próxima no V+ USA.
            <br />
            <Link href={checklistUrl} style={{ color: brand.muted }}>
              Gerenciar lembretes na sua conta
            </Link>
            <br />
            <br />
            V+ USA · vplusa.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: VisaReminderEmail,
  subject: (data: Record<string, unknown>) => {
    const days = typeof data.daysUntil === "number" ? data.daysUntil : 7;
    const step = typeof data.stepLabel === "string" ? data.stepLabel : "Etapa do visto H-2A";
    if (days <= 1) return `URGENTE: ${step} vence amanhã`;
    if (days <= 7) return `Faltam ${days} dias: ${step}`;
    return `Lembrete: ${step} em ${days} dias`;
  },
  displayName: "Lembrete do checklist H-2A",
  previewData: {
    recipientName: "João",
    stepLabel: "Entrevista no consulado",
    daysUntil: 7,
    dueDate: "15/07/2026",
    checklistUrl: "https://vplusa.com/app/visto",
  },
} satisfies TemplateEntry;

export default VisaReminderEmail;
