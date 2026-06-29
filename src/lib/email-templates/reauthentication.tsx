import * as React from "react";
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { styles } from "./_brand";

interface ReauthenticationEmailProps {
  token: string;
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.band} />
        <Section style={styles.header}>
          <Text style={styles.brandLine}>V+ USA</Text>
          <Text style={styles.brandTag}>Confirmação de identidade</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Código de verificação</Heading>
          <Text style={styles.text}>
            Use o código abaixo para confirmar sua identidade. Ele expira em
            poucos minutos.
          </Text>
          <Text style={styles.code}>{token}</Text>
          <div style={styles.divider} />
        </Section>
        <Text style={styles.footer}>
          Se você não solicitou esta verificação, ignore este e-mail e considere
          trocar sua senha.
          <br />
          <br />
          V+ USA · vplusa.com
        </Text>
      </Container>
    </Body>
  </Html>
);

export default ReauthenticationEmail;
