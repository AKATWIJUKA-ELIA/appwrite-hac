"use client";

import { ExternalLink, Info, Mail, MailX, Search, Trophy } from "lucide-react";
import { TrackBadge, VerificationBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAmount, formatMoney } from "@/lib/format";
import type { BoardRow } from "@/lib/requests/board";
import { cn } from "@/lib/utils";
import { TRACK_COPY, type BoardTrack } from "@/lib/vocabulary";

/**
 * The comparison board. A crawled row appearing — or a confirmed reply
 * upgrading it — shows up here as the page refreshes. That change is the
 * whole product.
 */
export function Board({ rows }: Readonly<{ rows: BoardRow[] }>) {
  const confirmed = rows.filter((row) => row.track === "confirmed").length;

  // The cheapest comparable price, so the leading row can be marked. USD
  // normalisation is preferred because it is the only way two currencies can
  // honestly be compared; rows without it fall back to their own total.
  const cheapest = rows.reduce<number | null>((low, row) => {
    const cost = row.normalizedUsdMinor ?? row.totalMinor;
    if (cost === null) return low;
    return low === null || cost < low ? cost : low;
  }, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparison board</CardTitle>
        <CardDescription>
          {rows.length === 0
            ? "Rows appear here the moment a supplier is found."
            : `${rows.length} supplier${rows.length === 1 ? "" : "s"}` +
              (confirmed > 0 ? ` · ${confirmed} confirmed by reply` : " · none confirmed yet")}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
            <Search className="size-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No suppliers yet. Discovery adds rows as it finds them.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[12rem]">Supplier</TableHead>
                    <TableHead>Price confidence</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">≈ USD</TableHead>
                    <TableHead className="text-right">Lead time</TableHead>
                    <TableHead className="text-right">Warranty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const cost = row.normalizedUsdMinor ?? row.totalMinor;
                    const leads =
                      cheapest !== null && cost !== null && cost === cheapest && row.totalMinor !== null;

                    return (
                      <TableRow key={row.supplierId} className={cn(leads && "bg-success-bg/40")}>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            {leads && (
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <Trophy className="mt-0.5 size-3.5 shrink-0 cursor-help text-success" />
                                  }
                                />
                                <TooltipContent>Lowest comparable price on the board.</TooltipContent>
                              </Tooltip>
                            )}
                            <div className="min-w-0">
                              <div className="leading-tight font-medium">{row.supplierName}</div>
                              {row.supplierDomain && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <span className="truncate">{row.supplierDomain}</span>
                                  {row.websiteUrl && (
                                    <a
                                      href={row.websiteUrl}
                                      target="_blank"
                                      rel="noreferrer noopener"
                                      className="shrink-0 hover:text-foreground"
                                      aria-label={`Open ${row.supplierName} website`}
                                    >
                                      <ExternalLink className="size-3" />
                                    </a>
                                  )}
                                </div>
                              )}
                              {row.contactEmail ? (
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                                  <Mail className="size-3 shrink-0 text-muted-foreground" />
                                  <span className="font-mono break-all">{row.contactEmail}</span>
                                  {row.contactVerification && (
                                    <VerificationBadge
                                      verification={row.contactVerification}
                                      className="px-1.5 py-0 text-[10px]"
                                    />
                                  )}
                                </div>
                              ) : (
                                <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/80">
                                  <MailX className="size-3 shrink-0" />
                                  No address found — add one when you approve
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <TrackBadge track={row.track} />
                        </TableCell>

                        <TableCell className="tabular text-right">
                          {row.totalMinor !== null && row.currency !== null ? (
                            <span className="font-medium">
                              <span className="text-xs text-muted-foreground">{row.currency} </span>
                              {formatAmount(row.totalMinor, row.currency)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="tabular text-right">
                          {row.normalizedUsdMinor !== null ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <span className="cursor-help underline decoration-dotted underline-offset-4" />
                                }
                              >
                                {formatMoney(row.normalizedUsdMinor, "USD")}
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {row.fxRate !== null && row.fxRateAt !== null
                                  ? `Converted at ${row.fxRate} ${row.currency}/USD from ${
                                      row.fxSource ?? "an unnamed source"
                                    }, snapshotted ${new Date(row.fxRateAt).toLocaleString()}. The rate is stored with the quote, so this figure cannot drift.`
                                  : "No exchange-rate snapshot was recorded for this quote."}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="tabular text-right">
                          {row.leadTimeDays !== null ? (
                            `${row.leadTimeDays} days`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>

                        <TableCell className="tabular text-right">
                          {row.warrantyMonths !== null ? (
                            `${row.warrantyMonths} mo`
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Only explain the labels actually present. A key describing
                "Awaiting reply" under a board with no awaiting rows reads as a
                live status rather than a definition. */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Info className="size-3.5" />
                What these labels mean
              </p>
              <dl className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(TRACK_COPY) as BoardTrack[])
                  .filter((track) => rows.some((row) => row.track === track))
                  .map((track) => (
                    <div key={track} className="flex items-start gap-2">
                      <dt className="shrink-0">
                        <TrackBadge track={track} />
                      </dt>
                      <dd className="text-xs leading-relaxed text-muted-foreground">
                        {TRACK_COPY[track].hint}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
