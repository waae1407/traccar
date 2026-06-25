import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { CheckCircle, AlertTriangle, Clock, MapPin, Camera, Upload, Shield, FileText } from 'lucide-react';

export default function HostReturnReviewPanel({ bookingId }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [disputePhotos, setDisputePhotos] = useState([]);

  const { data: booking, isLoading } = useQuery({
    queryKey: ['host-return-review', bookingId],
    queryFn: async () => {
      const results = await base44.entities.BookingRequest.filter({ id: bookingId });
      return results[0];
    },
    enabled: !!bookingId,
    refetchInterval: 30_000,
  });

  const { data: packets = [] } = useQuery({
    queryKey: ['return-evidence-packets', bookingId],
    queryFn: () => base44.entities.InspectionEvidencePacket.filter({ booking_request_id: bookingId, inspection_type: 'dropoff' }, '-created_date', 5),
    enabled: !!bookingId,
  });
  const packet = packets[0];

  const { data: photos = [] } = useQuery({
    queryKey: ['return-evidence-photos', packet?.id],
    queryFn: () => base44.entities.InspectionEvidencePhoto.filter({ packet_id: packet?.id }, '-uploaded_at', 20),
    enabled: !!packet?.id,
  });

  if (isLoading) return <div className="p-4 text-muted-foreground">Loading return review...</div>;
  if (!booking) return <div className="p-4 text-muted-foreground">Booking not found.</div>;

  const now = new Date();
  const returnCompletedAt = booking.return_completed_at || booking.dropoff_submitted_at;
  const reviewDueAt = booking.host_review_due_at || (returnCompletedAt ? new Date(new Date(returnCompletedAt).getTime() + 24 * 60 * 60 * 1000) : null);
  const isWindowExpired = reviewDueAt && now > new Date(reviewDueAt);
  const isAutoCompleted = booking.auto_completed_at || booking.completion_reason === 'host_review_window_expired';
  const canDispute = booking.damage_dispute_allowed_after_auto_complete !== false && booking.damage_dispute_status !== 'open' && booking.damage_dispute_status !== 'resolved';

  const handleApprove = async () => {
    await base44.functions.invoke('acceptReturnReview', { booking_request_id: bookingId });
    qc.invalidateQueries({ queryKey: ['host-return-review', bookingId] });
  };

  const handleReportDamage = async () => {
    await base44.entities.BookingRequest.update(bookingId, {
      host_review_status: 'damage_reported',
      damage_dispute_status: 'open',
      damage_dispute_opened_at: new Date().toISOString(),
      lifecycle_audit_notes: notes,
    });
    qc.invalidateQueries({ queryKey: ['host-return-review', bookingId] });
  };

  const handleUploadDisputePhoto = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setDisputePhotos(prev => [...prev, file_url]);
    } finally {
      setUploading(false);
    }
  };

  const handleAdminReview = async () => {
    await base44.entities.BookingRequest.update(bookingId, {
      host_review_status: 'admin_review_requested',
      lifecycle_audit_notes: notes,
    });
    qc.invalidateQueries({ queryKey: ['host-return-review', bookingId] });
  };

  const timeRemaining = reviewDueAt ? Math.max(0, new Date(reviewDueAt).getTime() - now.getTime()) : 0;
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <Card className={isAutoCompleted ? "border-orange-500/40" : "border-yellow-500/40"}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {isAutoCompleted ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Clock className="h-5 w-5 text-yellow-500" />}
                Return Review
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {booking.vehicle_name} — {booking.customer_full_name}
              </p>
            </div>
            <Badge variant={isAutoCompleted ? "secondary" : "default"}>
              {isAutoCompleted ? "Auto-Completed" : isWindowExpired ? "Window Expired" : `${hoursRemaining}h ${minutesRemaining}m left`}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Return Submitted</p>
              <p className="font-medium">{returnCompletedAt ? format(new Date(returnCompletedAt), "MMM d, h:mm a") : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Review Deadline</p>
              <p className="font-medium">{reviewDueAt ? format(new Date(reviewDueAt), "MMM d, h:mm a") : "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Geofence Verified</p>
              <p className="font-medium">
                {booking.post_inspection_geofence_verified ? "✅ Within 5 miles" : "❌ Outside geofence"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Distance from Return Location</p>
              <p className="font-medium">{booking.return_distance_from_pickup_miles != null ? `${booking.return_distance_from_pickup_miles} mi` : "—"}</p>
            </div>
          </div>

          {isAutoCompleted && (
            <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-orange-500">Auto-Completed — Review Window Expired</p>
                  {canDispute ? (
                    <p className="text-muted-foreground mt-1">You can still open a damage dispute until the dispute deadline passes.</p>
                  ) : booking.vehicle_moved_after_return_at ? (
                    <p className="text-muted-foreground mt-1">Dispute is restricted — vehicle moved {booking.vehicle_distance_from_return_miles} miles after return. Admin exception required.</p>
                  ) : (
                    <p className="text-muted-foreground mt-1">Dispute window has passed.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return Photos */}
      {photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Camera className="h-4 w-4" /> Customer Return Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, i) => (
                <a key={i} href={photo.photo_url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-border">
                  <img src={photo.photo_url} alt={photo.photo_slot} className="w-full h-24 object-cover" />
                </a>
              ))}
            </div>
            {packet?.location_label && (
              <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {packet.location_label}
                {packet.gps_distance_miles != null && <span className="ml-2">({packet.gps_distance_miles} mi from expected)</span>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Review Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about the return condition, damage, or other observations..."
            className="min-h-[100px]"
          />
        </CardContent>
      </Card>

      {/* Dispute Photo Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Dispute Photos (Optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap mb-3">
            {disputePhotos.map((url, i) => (
              <img key={i} src={url} alt={`Dispute ${i+1}`} className="h-20 w-20 object-cover rounded-lg border border-border" />
            ))}
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            id="dispute-photo-upload"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadDisputePhoto(file);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => document.getElementById('dispute-photo-upload')?.click()}
          >
            {uploading ? "Uploading..." : "Add Dispute Photo"}
          </Button>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {!isAutoCompleted && (
          <Button onClick={handleApprove} className="w-full" size="lg">
            <CheckCircle className="h-4 w-4 mr-2" />
            Approve Return
          </Button>
        )}
        <Button onClick={handleReportDamage} variant="destructive" className="w-full" size="lg">
          <AlertTriangle className="h-4 w-4 mr-2" />
          Report Damage / Open Dispute
        </Button>
        <Button onClick={handleAdminReview} variant="outline" className="w-full">
          <Shield className="h-4 w-4 mr-2" />
          Request Admin Review
        </Button>
      </div>
    </div>
  );
}