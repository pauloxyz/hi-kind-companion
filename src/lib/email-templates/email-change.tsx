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

interface EmailChangeEmailProps {
  siteName: string;
  siteUrl: string;
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // correctly.
  oldEmail: string;
  newEmail: string;
  confirmationUrl: string;
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme a alteração do seu e-mail no {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.band} />
        <Section style={styles.header}>
          <Text style={styles.brandLine}>V+ USA</Text>
          <Text style={styles.brandTag}>Alteração de e-mail</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirme seu novo e-mail</Heading>
          <Text style={styles.text}>
            Você pediu para trocar o e-mail da sua conta no {siteName} de{" "}
            <Link href={`mailto:${oldEmail}`} style={styles.link}>
              {oldEmail}
            </Link>{" "}
            para{" "}
            <Link href={`mailto:${newEmail}`} style={styles.link}>
              {newEmail}
            </Link>
            .
          </Text>
          <Text style={styles.text}>
            Para concluir a alteração, confirme o novo endereço:
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Confirmar novo e-mail
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
          Se você não solicitou esta alteração, ignore este e-mail e considere
          trocar sua senha por precaução.
          <br />
          <br />
          {siteName} · vplusa.com
        </Text>
      </Container>
    </Body>
  </Html>
);

export default EmailChangeEmail;
