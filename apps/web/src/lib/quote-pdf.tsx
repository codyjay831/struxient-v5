import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { QuoteCustomerPreviewDocument } from "./quote-customer-projection";
import { formatPaymentAnchorLabel } from "./quote-display";

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
  proposalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 24,
    marginBottom: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#d9d9d9",
  },
  proposalHeaderMain: {
    flexGrow: 1,
    flexShrink: 1,
  },
  proposalEyebrow: {
    fontSize: 8,
    color: "#777",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  proposalTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginTop: 8,
    marginBottom: 8,
  },
  proposalIntro: {
    fontSize: 10,
    color: "#555",
    lineHeight: 1.35,
  },
  totalCard: {
    width: 150,
    padding: 12,
    backgroundColor: "#f2f2f2",
    borderRadius: 6,
  },
  totalCardAmount: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 5,
  },
  metaGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  metaBox: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 5,
  },
  metaValue: {
    fontSize: 11,
    fontWeight: "bold",
    marginTop: 4,
  },
  compactSection: {
    marginBottom: 18,
  },
  compactLineItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  groupLabel: {
    fontSize: 8,
    color: "#777",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  paymentTitle: {
    fontSize: 10,
    fontWeight: "bold",
    marginBottom: 3,
  },
  paymentAnchor: {
    fontSize: 9,
    color: "#666",
  },
  totalsBox: {
    marginLeft: "auto",
    width: 210,
    paddingTop: 8,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  totalsLabel: {
    fontSize: 10,
    color: "#666",
  },
  totalsValue: {
    fontSize: 10,
    fontWeight: "bold",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#d9d9d9",
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
});

export type QuoteProposalPdfModel = {
  organizationDisplayName: string;
  documentTitle: string;
  generatedDateLabel: string;
  customerName: string | null;
  projectTitle: string | null;
  lineItems: Array<{
    id: string;
    presentationGroup: string | null;
    lineTitle: string;
    lineDetail: string | null;
    includedNotes: string | null;
    excludedNotes: string | null;
    quantityPriceLabel: string;
    lineTotalLabel: string;
  }>;
  paymentSchedule: Array<{
    id: string;
    title: string;
    anchorLabel: string;
    amountLabel: string;
  }>;
  scheduledPaymentsTotalLabel: string | null;
  subtotalLabel: string;
  totalLabel: string;
  footerNote: string;
};

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function buildQuoteProposalPdfModel(
  frozenDocument: QuoteCustomerPreviewDocument,
  options: { generatedAt?: Date } = {},
): QuoteProposalPdfModel {
  const generatedAt = options.generatedAt ?? new Date();
  const scheduledTotalCents = frozenDocument.paymentSchedule.reduce(
    (sum, milestone) => sum + milestone.amountCents,
    0,
  );

  return {
    organizationDisplayName: frozenDocument.organizationDisplayName,
    documentTitle: frozenDocument.documentTitle,
    generatedDateLabel: formatDate(generatedAt),
    customerName: frozenDocument.customer?.displayName ?? null,
    projectTitle: frozenDocument.lead?.title ?? null,
    lineItems: frozenDocument.lineItems.map((line) => ({
      id: line.id,
      presentationGroup: line.presentationGroup,
      lineTitle: line.lineTitle,
      lineDetail: line.lineDetail,
      includedNotes: line.includedNotes,
      excludedNotes: line.excludedNotes,
      quantityPriceLabel: `${line.quantityDisplay} @ ${formatMoney(line.unitAmountCents)}`,
      lineTotalLabel: formatMoney(line.lineTotalCents),
    })),
    paymentSchedule: frozenDocument.paymentSchedule.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      anchorLabel: formatPaymentAnchorLabel(milestone.anchorType, milestone.anchorStageName),
      amountLabel: formatMoney(milestone.amountCents),
    })),
    scheduledPaymentsTotalLabel:
      frozenDocument.paymentSchedule.length > 0 ? formatMoney(scheduledTotalCents) : null,
    subtotalLabel: formatMoney(frozenDocument.subtotalCents),
    totalLabel: formatMoney(frozenDocument.totalCents),
    footerNote:
      "Sent proposal record. Review the scope, pricing, and payment terms before accepting electronically through the secure link.",
  };
}

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
  model,
}: {
  model: QuoteProposalPdfModel;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.proposalHeader}>
          <View style={styles.proposalHeaderMain}>
            <Text style={styles.proposalEyebrow}>Proposal from</Text>
            <Text style={styles.orgName}>{model.organizationDisplayName}</Text>
            <Text style={styles.proposalTitle}>{model.documentTitle}</Text>
            <Text style={styles.proposalIntro}>
              Review the scope, pricing, and payment terms below before accepting electronically.
            </Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Proposal total</Text>
            <Text style={styles.totalCardAmount}>{model.totalLabel}</Text>
            <Text style={{ marginTop: 8, fontSize: 8, color: "#777" }}>
              Generated {model.generatedDateLabel}
            </Text>
          </View>
        </View>

        {model.customerName || model.projectTitle ? (
          <View style={styles.metaGrid}>
            {model.customerName ? (
              <View style={styles.metaBox}>
                <Text style={styles.proposalEyebrow}>Prepared for</Text>
                <Text style={styles.metaValue}>{model.customerName}</Text>
              </View>
            ) : null}
            {model.projectTitle ? (
              <View style={styles.metaBox}>
                <Text style={styles.proposalEyebrow}>Project</Text>
                <Text style={styles.metaValue}>{model.projectTitle}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.compactSection}>
          <Text style={styles.sectionTitle}>Scope of Work</Text>
          {model.lineItems.map((line, index) => {
            const previous = model.lineItems[index - 1];
            const showGroup =
              line.presentationGroup &&
              (!previous || previous.presentationGroup !== line.presentationGroup);
            return (
              <View key={line.id} style={styles.compactLineItem}>
                {showGroup ? <Text style={styles.groupLabel}>{line.presentationGroup}</Text> : null}
                <Text style={styles.lineTitle}>{line.lineTitle}</Text>
                {line.lineDetail ? <Text style={styles.lineDetail}>{line.lineDetail}</Text> : null}
                {line.includedNotes ? (
                  <View style={styles.lineNotes}>
                    <Text style={styles.notesLabel}>Included</Text>
                    <Text>{line.includedNotes}</Text>
                  </View>
                ) : null}
                {line.excludedNotes ? (
                  <View style={styles.lineNotes}>
                    <Text style={styles.notesLabel}>Not Included</Text>
                    <Text>{line.excludedNotes}</Text>
                  </View>
                ) : null}
                <View style={styles.linePricing}>
                  <Text style={styles.lineQuantity}>{line.quantityPriceLabel}</Text>
                  <Text style={styles.linePrice}>{line.lineTotalLabel}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {model.paymentSchedule.length > 0 ? (
          <View style={styles.compactSection}>
            <Text style={styles.sectionTitle}>Payment Terms</Text>
            {model.paymentSchedule.map((milestone) => (
              <View key={milestone.id} style={styles.paymentRow}>
                <View style={{ flexGrow: 1, flexShrink: 1 }}>
                  <Text style={styles.paymentTitle}>{milestone.title}</Text>
                  <Text style={styles.paymentAnchor}>{milestone.anchorLabel}</Text>
                </View>
                <Text style={styles.linePrice}>{milestone.amountLabel}</Text>
              </View>
            ))}
            {model.scheduledPaymentsTotalLabel ? (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Scheduled payments</Text>
                <Text style={styles.totalsValue}>{model.scheduledPaymentsTotalLabel}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.totalsBox}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{model.subtotalLabel}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.lineTitle}>Total</Text>
            <Text style={styles.grandTotalValue}>{model.totalLabel}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>{model.footerNote}</Text>
          <Text style={{ marginTop: 4 }}>
            © {new Date().getFullYear()} {model.organizationDisplayName} · Powered by Struxient
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderQuoteProposalPdf(
  document: QuoteCustomerPreviewDocument,
): Promise<Buffer> {
  return await renderToBuffer(
    <QuoteProposalPdfDocument model={buildQuoteProposalPdfModel(document)} />,
  );
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
