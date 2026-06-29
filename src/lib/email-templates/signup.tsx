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

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme seu e-mail para começar sua jornada H-2A</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.band} />
        <Section style={styles.header}>
          <Text style={styles.brandLine}>V+ USA</Text>
          <Text style={styles.brandTag}>Sua jornada H-2A começa aqui</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirme seu e-mail</Heading>
          <Text style={styles.text}>
            Olá! Obrigado por criar sua conta no{" "}
            <Link href={siteUrl} style={styles.link}>
              <strong>{siteName}</strong>
            </Link>
            . Estamos felizes em te ajudar a conquistar seu visto H-2A com segurança.
          </Text>
          <Text style={styles.text}>
            Para ativar sua conta, confirme o e-mail{" "}
            <Link href={`mailto:${recipient}`} style={styles.link}>
              {recipient}
            </Link>{" "}
            clicando no botão abaixo:
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Confirmar meu e-mail
          </Button>
          <Text style={{ ...styles.text, fontSize: "13px", color: brand.muted }}>
            Se o botão não funcionar, copie e cole este link no navegador:
            <br />
            <Link href={confirmationUrl} style={styles.link}>
              {confirmationUrl}
            </Link>
          </Text>
          <div style={styles.divider} />
        </Section>
        <Text style={styles.footer}>
          Se você não criou esta conta, pode ignorar este e-mail com segurança —
          nenhuma ação será tomada.
          <br />
          <br />
          {siteName} · vplusa.com
        </Text>
      </Container>
    </Body>
  </Html>
);

export default SignupEmail;
