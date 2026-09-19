import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { CurrentDecision } from "./current-decision";
import type { Overview } from "@/lib/casa-pepe-types";
import { LOCALE_STORAGE_KEY } from "@/lib/i18n";
const overview={incident:{facts:[]},agent:{cycleInProgress:false,lastCycleOutcome:{kind:"completed",waitingFor:["Waiting for operator approval"]}},plan:{kind:"plan",plan:{summary:"Restore orders",reason:"Routing depends on orders",capacity:{plannedUnits:7,assumedCapacity:7,confirmed:true},priorities:[{serviceIdentifier:"orders",rank:1,serviceName:"Orders",decision:"recover-now",reason:"Unblocks routing",blockedBy:[]}],assumptions:["Snapshot is current"],changesFromPrevious:[{description:"Capacity fell from 12 to 7"}],steps:[{title:"Recover orders",reason:"Routing depends on orders",status:"awaiting-approval",owner:{name:"Operator"}}]}}} as unknown as Overview;
describe("current decision",()=>{
 it.each(["es","en"])("V07 shows reasons, owner, capacity and changes in %s",locale=>{
  window.localStorage.setItem(LOCALE_STORAGE_KEY,locale);
  render(<LocaleProvider><CurrentDecision overview={overview}/></LocaleProvider>);
  expect(screen.getAllByText("Routing depends on orders")[0]).toBeVisible();
  expect(screen.getByText(/7\/7/)).toBeVisible();
  expect(screen.getByText(/Capacity fell from 12 to 7/)).toBeVisible();
  expect(screen.getByText(/Responsable: Operator|Owner: Operator/)).toBeVisible();
  expect(screen.getByText("Waiting for operator approval")).toBeVisible();
  fireEvent.click(screen.getByText(/Orden de prioridad|Priority order/));
  expect(screen.getByText("Unblocks routing")).toBeInTheDocument();
  expect(screen.queryByText(/verified|verificado/i)).not.toBeInTheDocument();
 });
});
