import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized. Admin only.' }, { status: 403 });
    }

    let hostsMigrated = 0;
    let hostsFailed = 0;
    let bookingsMigrated = 0;
    let bookingsFailed = 0;

    // 1. Migrate Host.generated_logos & Host.generated_icons
    const hosts = await base44.asServiceRole.entities.Host.list();
    for (const host of hosts) {
      let changed = false;
      const newLogos = [];
      const newIcons = [];

      for (const logo of (host.generated_logos || [])) {
        if (typeof logo === 'string' && logo.startsWith('data:image')) {
          try {
            const uploadRes = await base44.asServiceRole.functions.invoke('uploadToR2', {
              fileBase64: logo,
              fileName: `migrated-logo-${Date.now()}.jpg`,
              fileType: 'image/jpeg'
            });
            if (uploadRes.data && uploadRes.data.file_url) {
              newLogos.push({
                url: uploadRes.data.file_url,
                storage_provider: 'cloudflare_r2',
                prompt: 'Migrated from Base64',
                created_at: new Date().toISOString()
              });
              changed = true;
            } else {
              newLogos.push(logo); // keep original
            }
          } catch (e) {
            newLogos.push(logo);
          }
        } else {
          newLogos.push(logo);
        }
      }

      for (const icon of (host.generated_icons || [])) {
        if (typeof icon === 'string' && icon.startsWith('data:image')) {
          try {
            const uploadRes = await base44.asServiceRole.functions.invoke('uploadToR2', {
              fileBase64: icon,
              fileName: `migrated-icon-${Date.now()}.jpg`,
              fileType: 'image/jpeg'
            });
            if (uploadRes.data && uploadRes.data.file_url) {
              newIcons.push({
                url: uploadRes.data.file_url,
                storage_provider: 'cloudflare_r2',
                prompt: 'Migrated from Base64',
                created_at: new Date().toISOString()
              });
              changed = true;
            } else {
              newIcons.push(icon);
            }
          } catch (e) {
            newIcons.push(icon);
          }
        } else {
          newIcons.push(icon);
        }
      }

      if (changed) {
        try {
          await base44.asServiceRole.entities.Host.update(host.id, {
            generated_logos: newLogos,
            generated_icons: newIcons
          });
          hostsMigrated++;
        } catch (e) {
          hostsFailed++;
        }
      }
    }

    // 2. Migrate BookingRequest.inspection_sample_images
    const bookings = await base44.asServiceRole.entities.BookingRequest.list();
    for (const booking of bookings) {
      if (!booking.inspection_sample_images) continue;
      
      let changed = false;
      const newSamples = { ...booking.inspection_sample_images };

      for (const [key, val] of Object.entries(newSamples)) {
        if (typeof val === 'string' && val.startsWith('data:image')) {
          try {
            const uploadRes = await base44.asServiceRole.functions.invoke('uploadToR2', {
              fileBase64: val,
              fileName: `migrated-inspection-${key}-${Date.now()}.jpg`,
              fileType: 'image/jpeg'
            });
            if (uploadRes.data && uploadRes.data.file_url) {
              newSamples[key] = {
                url: uploadRes.data.file_url,
                storage_provider: 'cloudflare_r2',
                prompt: 'Migrated from Base64',
                generated_at: new Date().toISOString()
              };
              changed = true;
            }
          } catch (e) {
            // keep original
          }
        }
      }

      if (changed) {
        try {
          await base44.asServiceRole.entities.BookingRequest.update(booking.id, {
            inspection_sample_images: newSamples
          });
          bookingsMigrated++;
        } catch (e) {
          bookingsFailed++;
        }
      }
    }

    return Response.json({ 
      success: true, 
      hostsMigrated, 
      hostsFailed,
      bookingsMigrated,
      bookingsFailed
    });

  } catch (error) {
    console.error("Migration error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});