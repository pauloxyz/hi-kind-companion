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

interface RecoveryEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
}

export const RecoveryEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefina sua senha do {siteName}</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.band} />
        <Section style={styles.header}>
          <Text style={styles.brandLine}>V+ USA</Text>
          <Text style={styles.brandTag}>Recuperação de acesso</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Redefinir senha</Heading>
          <Text style={styles.text}>
            Recebemos um pedido para redefinir a senha da sua conta no{" "}
            <Link href={siteUrl} style={styles.link}>
              <strong>{siteName}</strong>
            </Link>
            . Use o botão abaixo para criar uma nova senha — o link expira em 1 hora.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Criar nova senha
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
          Se você não solicitou esta redefinição, ignore este e-mail — sua senha
          atual continua válida.
          <br />
          <br />
          {siteName} · vplusa.com
        </Text>
      </Container>
    </Body>
  </Html>
);

export default RecoveryEmail;
