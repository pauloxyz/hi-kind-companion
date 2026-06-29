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

interface MagicLinkEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
}

export const MagicLinkEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu link de acesso ao {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.band} />
        <Section style={styles.header}>
          <Text style={styles.brandLine}>V+ USA</Text>
          <Text style={styles.brandTag}>Acesso rápido sem senha</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Entrar no {siteName}</Heading>
          <Text style={styles.text}>
            Você pediu um link de acesso. Clique no botão abaixo para entrar — o
            link funciona apenas uma vez e expira em 1 hora.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Entrar na minha conta
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
          Se você não pediu este link, pode ignorar este e-mail.
          <br />
          <br />
          {siteName} ·{" "}
          <Link href={siteUrl} style={{ color: brand.muted }}>
            vplusa.com
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

export default MagicLinkEmail;
