import assert from "node:assert/strict";
import test from "node:test";
import { LeadStatus } from "@prisma/client";
import {
  ISSUED_QUOTE_REVISION_MESSAGE,
  leadStatusAfterQuoteWork,
} from "./lead-promotion-semantics";

test("leadStatusAfterQuoteWork keeps terminal and hold states", () => {
  assert.equal(leadStatusAfterQuoteWork(LeadStatus.LOST), LeadStatus.LOST);
  assert.equal(leadStatusAfterQuoteWork(LeadStatus.ARCHIVED), LeadStatus.ARCHIVED);
  assert.equal(leadStatusAfterQuoteWork(LeadStatus.ON_HOLD), LeadStatus.ON_HOLD);
});

test("leadStatusAfterQuoteWork moves active leads into qualified pipeline", () => {
  assert.equal(leadStatusAfterQuoteWork(LeadStatus.NEW), LeadStatus.QUALIFIED);
  assert.equal(leadStatusAfterQuoteWork(LeadStatus.TRIAGING), LeadStatus.QUALIFIED);
  assert.equal(leadStatusAfterQuoteWork(LeadStatus.QUALIFIED), LeadStatus.QUALIFIED);
  assert.equal(leadStatusAfterQuoteWork(LeadStatus.CONVERTED), LeadStatus.QUALIFIED);
});

test("issued quote revision message tells staff to revise explicitly", () => {
  assert.match(ISSUED_QUOTE_REVISION_MESSAGE, /revision/i);
  assert.match(ISSUED_QUOTE_REVISION_MESSAGE, /sent or approved/i);
});
