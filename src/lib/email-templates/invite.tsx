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

interface InviteEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado para o {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.band} />
        <Section style={styles.header}>
          <Text style={styles.brandLine}>V+ USA</Text>
          <Text style={styles.brandTag}>Você foi convidado</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Bem-vindo ao {siteName}</Heading>
          <Text style={styles.text}>
            Você foi convidado a participar do{" "}
            <Link href={siteUrl} style={styles.link}>
              <strong>{siteName}</strong>
            </Link>
            , a plataforma que organiza sua jornada para o visto H-2A do começo
            ao fim — vagas certificadas pelo DOL, checklist consular, currículo
            em inglês e acompanhamento das candidaturas.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Aceitar convite
          </Button>
          <Text style={{ ...styles.text, fontSize: "13px", color: brand.muted }}>
            Se o botão não funcionar, copie e cole no navegador:
            <br />
            <Link href={confirmationUrl} style={styles.link}>
              {confirmationUrl}
            </Link>
          </Text>
          <div style={styles.divider} />
        </Section>
        <Text style={styles.footer}>
          Se você não estava esperando este convite, pode ignorar este e-mail.
          <br />
          <br />
          {siteName} · vplusa.com
        </Text>
      </Container>
    </Body>
  </Html>
);

export default InviteEmail;
