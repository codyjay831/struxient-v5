import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { QuoteCustomerPreviewDocument } from "./quote-customer-projection";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 30,
  },
  orgName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  documentTitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 20,
  },
  totalSection: {
    marginBottom: 30,
    padding: 15,
    backgroundColor: "#f5f5f5",
    borderRadius: 4,
  },
  totalLabel: {
    fontSize: 10,
    color: "#666",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: "bold",
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "#666",
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  lineItem: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  lineTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 4,
  },
  lineDetail: {
    fontSize: 10,
    color: "#666",
    marginBottom: 8,
    lineHeight: 1.4,
  },
  lineNotes: {
    fontSize: 9,
    color: "#666",
    marginTop: 5,
  },
  notesLabel: {
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  linePricing: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  linePrice: {
    fontSize: 11,
    fontWeight: "bold",
  },
  lineQuantity: {
    fontSize: 9,
    color: "#666",
  },
  signatureSection: {
    marginTop: 40,
    padding: 15,
    backgroundColor: "#f9f9f9",
    borderRadius: 4,
  },
  signatureTitle: {
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 10,
  },
  signatureDetail: {
    fontSize: 10,
    marginBottom: 4,
  },
  footer: {
    marginTop: 30,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    fontSize: 8,
    color: "#999",
  },
});

function QuotePdfDocument({
  document,
  acceptedByName,
  acceptedAtIso,
  ip,
  userAgent,
}: {
  document: QuoteCustomerPreviewDocument;
  acceptedByName: string;
  acceptedAtIso: string;
  ip?: string;
  userAgent?: string | null;
}) {
  const formatMoney = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{document.organizationDisplayName}</Text>
          <Text style={styles.documentTitle}>{document.documentTitle}</Text>
          <Text style={{ fontSize: 9, color: "#999" }}>
            Updated: {new Date(document.updatedAt).toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatMoney(document.totalCents)}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scope of Work</Text>
          {document.lineItems.map((line) => (
            <View key={line.id} style={styles.lineItem}>
              <Text style={styles.lineTitle}>{line.lineTitle}</Text>

              {line.lineDetail && (
                <Text style={styles.lineDetail}>{line.lineDetail}</Text>
              )}

              {line.includedNotes && (
                <View style={styles.lineNotes}>
                  <Text style={styles.notesLabel}>Included</Text>
                  <Text>{line.includedNotes}</Text>
                </View>
              )}

              {line.excludedNotes && (
                <View style={styles.lineNotes}>
                  <Text style={styles.notesLabel}>Not Included</Text>
                  <Text>{line.excludedNotes}</Text>
                </View>
              )}

              <View style={styles.linePricing}>
                <Text style={styles.lineQuantity}>
                  {line.quantityDisplay} @ {formatMoney(line.unitAmountCents)}
                </Text>
                <Text style={styles.linePrice}>{formatMoney(line.lineTotalCents)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.signatureSection}>
          <Text style={styles.signatureTitle}>Electronically Signed</Text>
          <Text style={styles.signatureDetail}>Signed by: {acceptedByName}</Text>
          <Text style={styles.signatureDetail}>
            Date: {new Date(acceptedAtIso).toLocaleString("en-US")}
          </Text>
          {ip && <Text style={styles.signatureDetail}>IP Address: {ip}</Text>}
          {userAgent && (
            <Text style={{ fontSize: 8, color: "#999", marginTop: 4 }}>
              User Agent: {userAgent}
            </Text>
          )}
        </View>

        <View style={styles.footer}>
          <Text>
            This is a legally binding electronically signed proposal acceptance.
          </Text>
          <Text style={{ marginTop: 4 }}>
            Generated: {new Date().toLocaleString("en-US")}
          </Text>
          <Text style={{ marginTop: 4 }}>
            © {new Date().getFullYear()} {document.organizationDisplayName} · Powered by Struxient
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderQuoteAcceptancePdf(
  document: QuoteCustomerPreviewDocument,
  metadata: {
    acceptedByName: string;
    acceptedAtIso: string;
    ip?: string;
    userAgent?: string | null;
  }
): Promise<Buffer> {
  return await renderToBuffer(
    <QuotePdfDocument document={document} {...metadata} />,
  );
}

function QuoteProposalPdfDocument({
  document,
}: {
  document: QuoteCustomerPreviewDocument;
}) {
  const formatMoney = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>{document.organizationDisplayName}</Text>
          <Text style={styles.documentTitle}>{document.documentTitle}</Text>
          <Text style={{ fontSize: 9, color: "#999" }}>
            Updated: {new Date(document.updatedAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatMoney(document.totalCents)}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scope of Work</Text>
          {document.lineItems.map((line) => (
            <View key={line.id} style={styles.lineItem}>
              <Text style={styles.lineTitle}>{line.lineTitle}</Text>
              {line.lineDetail ? <Text style={styles.lineDetail}>{line.lineDetail}</Text> : null}
              <View style={styles.linePricing}>
                <Text style={styles.lineQuantity}>
                  {line.quantityDisplay} @ {formatMoney(line.unitAmountCents)}
                </Text>
                <Text style={styles.linePrice}>{formatMoney(line.lineTotalCents)}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.footer}>
          <Text>Proposal document — review and accept electronically via secure link.</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderQuoteProposalPdf(
  document: QuoteCustomerPreviewDocument,
): Promise<Buffer> {
  return await renderToBuffer(<QuoteProposalPdfDocument document={document} />);
}

export type AuditPacketMetadata = {
  quoteId: string;
  signatureRequestId: string;
  recipientId: string;
  mode: string;
  provider: string;
  sentAtIso: string;
  acceptedAtIso: string;
  acceptedByName: string;
  signerEmail?: string | null;
  ip?: string;
  userAgent?: string | null;
  consentText: string;
  consentVersion: string;
  consentAcceptedAtIso: string;
  frozenSnapshotSha256: string;
  sentPdfSha256: string;
  finalPdfSha256: string;
  eventSummary: string[];
};

function AuditPacketDocument({
  document,
  metadata,
}: {
  document: QuoteCustomerPreviewDocument;
  metadata: AuditPacketMetadata;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.orgName}>Audit Certificate</Text>
          <Text style={styles.documentTitle}>{document.documentTitle}</Text>
        </View>
        <View style={styles.signatureSection}>
          <Text style={styles.signatureTitle}>Standard Acceptance Record</Text>
          <Text style={styles.signatureDetail}>Quote ID: {metadata.quoteId}</Text>
          <Text style={styles.signatureDetail}>Request ID: {metadata.signatureRequestId}</Text>
          <Text style={styles.signatureDetail}>Recipient ID: {metadata.recipientId}</Text>
          <Text style={styles.signatureDetail}>Signed by: {metadata.acceptedByName}</Text>
          <Text style={styles.signatureDetail}>
            Accepted: {new Date(metadata.acceptedAtIso).toLocaleString("en-US")}
          </Text>
          <Text style={styles.signatureDetail}>Consent version: {metadata.consentVersion}</Text>
          <Text style={styles.signatureDetail}>Frozen snapshot SHA-256: {metadata.frozenSnapshotSha256}</Text>
          <Text style={styles.signatureDetail}>Sent PDF SHA-256: {metadata.sentPdfSha256}</Text>
          <Text style={styles.signatureDetail}>Final PDF SHA-256: {metadata.finalPdfSha256}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Event Timeline</Text>
          {metadata.eventSummary.map((line, i) => (
            <Text key={i} style={{ fontSize: 9, marginBottom: 4 }}>
              {line}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function renderQuoteAuditPacketPdf(
  document: QuoteCustomerPreviewDocument,
  metadata: AuditPacketMetadata,
): Promise<Buffer> {
  return await renderToBuffer(<AuditPacketDocument document={document} metadata={metadata} />);
}
