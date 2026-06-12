import React from 'react';
import Contactless360Banner from '@/components/gps/Contactless360Banner';

/**
 * GPS CTA card for Vehicle360 / HostVehicle360 Telematics tab when no device is assigned.
 */
export default function GPSCtaCard({ vehicleId }) {
  return <Contactless360Banner variant="vehicle-cta" vehicleId={vehicleId} />;
}