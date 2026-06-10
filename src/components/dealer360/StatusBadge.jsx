import { Badge } from '@/components/ui/badge';

const PURCHASE_COLORS = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-500/20 text-blue-400',
  funded: 'bg-cyan-500/20 text-cyan-400',
  under_review: 'bg-yellow-500/20 text-yellow-400',
  bid_placed: 'bg-purple-500/20 text-purple-400',
  outbid: 'bg-orange-500/20 text-orange-400',
  won: 'bg-green-500/20 text-green-400',
  lost: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
  invoice_pending: 'bg-yellow-500/20 text-yellow-400',
  payment_due: 'bg-orange-500/20 text-orange-400',
  completed: 'bg-green-500/20 text-green-400',
};

const SELL_COLORS = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-500/20 text-blue-400',
  under_review: 'bg-yellow-500/20 text-yellow-400',
  valuation_complete: 'bg-cyan-500/20 text-cyan-400',
  listed: 'bg-purple-500/20 text-purple-400',
  offer_received: 'bg-orange-500/20 text-orange-400',
  accepted: 'bg-green-500/20 text-green-400',
  inspection_scheduled: 'bg-blue-500/20 text-blue-400',
  sold: 'bg-green-500/20 text-green-400',
  cancelled: 'bg-muted text-muted-foreground',
  lost: 'bg-red-500/20 text-red-400',
};

const LABELS = {
  draft: 'Draft', submitted: 'Submitted', funded: 'Funded', under_review: 'Under Review',
  bid_placed: 'Bid Placed', outbid: 'Outbid', won: 'Won', lost: 'Lost',
  cancelled: 'Cancelled', invoice_pending: 'Invoice Pending', payment_due: 'Payment Due',
  completed: 'Completed', valuation_complete: 'Valuation Done', listed: 'Listed',
  offer_received: 'Offer Received', accepted: 'Accepted', inspection_scheduled: 'Inspection Scheduled',
  sold: 'Sold',
};

export default function Dealer360StatusBadge({ status, type = 'purchase' }) {
  const colors = type === 'sell' ? SELL_COLORS : PURCHASE_COLORS;
  return (
    <Badge className={`text-xs ${colors[status] || 'bg-muted text-muted-foreground'}`}>
      {LABELS[status] || status}
    </Badge>
  );
}