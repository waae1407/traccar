import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { uploadFile } from '@/utils/uploadFile';
import IdentityVerificationPanel from '@/components/shared/IdentityVerificationPanel';
import InstallerLocatorCTA from '@/components/installers/InstallerLocatorCTA';
import { AlertTriangle, ArrowRight, Car, CheckCircle2, CreditCard, Loader2, Radio, Rocket, ShieldCheck, Upload } from 'lucide-react';

const steps = [
  'Vehicle Details',
  'Registration',
  'Insurance',
  'Host ID Verification',
  'Plan / Subscription',
  'Payment Setup',
  'GPS Setup',
  'Publish',
];

const emptyVehicle = {
  vin: '', year: '', make: '', model: '', mileage: '', city: '', state: '', pickup_address: '', weekly_rate: '', monthly_rate: '', image_url: '', rent_to_own_eligible: false, contactless_pickup: false,
};

function StatusCard({ title, item, children }) {
  const done = item?.status === 'Done';
  return (
    <div className={`rounded-2xl border p-4 ${done ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'}`}>
      <div className="flex items-start gap-3">
        {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />}
        <div className="flex-1">
          <p className={`font-black ${done ? 'text-emerald-950' : 'text-amber-950'}`}>{title}</p>
          {item?.detail && <p className="mt-1 text-sm text-gray-600">{item.detail}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

function StepList({ currentStep, setCurrentStep, readiness }) {
  const statusFor = [
    readiness?.vehicle_details_status,
    readiness?.registration_status,
    readiness?.insurance_status,
    readiness?.host_identity_status,
    readiness?.subscription_status,
    readiness?.payment_setup_status,
    readiness?.gps_status,
    readiness?.publish_status,
  ];
  return (
    <div className="rounded-3xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((label, index) => {
          const active = currentStep === index;
          const done = statusFor[index]?.status === 'Done' || statusFor[index]?.status === 'Skipped' || (index === 6 && statusFor[index]?.status === 'Optional');
          return <button key={label} type="button" onClick={() => setCurrentStep(index)} className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-left text-xs font-black transition-all ${active ? 'border-pink-200 bg-pink-50 text-pink-700' : done ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-gray-100 bg-gray-50 text-gray-600'}`}>{done ? <CheckCircle2 className="h-4 w-4" /> : <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px]">{index + 1}</span>}{label}</button>;
        })}
      </div>
    </div>
  );
}

export default function HostFirstVehicleSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const urlVehicleId = new URLSearchParams(window.location.search).get('vehicle_id');
  const [currentStep, setCurrentStep] = useState(0);
  const [vehicleId, setVehicleId] = useState(urlVehicleId || '');
  const [vehicleForm, setVehicleForm] = useState(emptyVehicle);
  const [docUploads, setDocUploads] = useState({});
  const [docLoading, setDocLoading] = useState({});
  const [decodingVin, setDecodingVin] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['first-vehicle-setup', user?.email, vehicleId],
    queryFn: async () => {
      const hosts = await base44.entities.Host.filter({ email: user.email });
      const host = hosts[0];
      if (!host?.id) return { host: null, vehicles: [], readiness: null, plan: null };
      const [vehicles, plans, readinessRes] = await Promise.all([
        base44.entities.Vehicle.filter({ host_id: host.id }),
        base44.entities.OperatorPlanConfiguration.filter({ host_id: host.id }, '-updated_date', 1),
        base44.functions.invoke('getHostVehicleSetupReadiness', { host_id: host.id, vehicle_id: vehicleId || undefined }),
      ]);
      const selectedVehicle = vehicleId ? vehicles.find((vehicle) => vehicle.id === vehicleId) : null;
      if (selectedVehicle) {
        setVehicleForm({ ...emptyVehicle, ...selectedVehicle, year: selectedVehicle.year || '', mileage: selectedVehicle.mileage || '', weekly_rate: selectedVehicle.weekly_rate || '', monthly_rate: selectedVehicle.monthly_rate || '' });
      }
      return { host, vehicles, selectedVehicle, plan: plans[0] || null, readiness: readinessRes.data };
    },
    enabled: !!user?.email,
  });

  const host = data?.host;
  const readiness = data?.readiness;
  const selectedVehicle = data?.selectedVehicle;
  const planMode = readiness?.plan_mode || data?.plan?.selected_mode || data?.plan?.active_mode || 'marketplace_partner';
  const paidPlanLabel = planMode === 'hybrid_growth' ? 'Hybrid Growth' : 'FleetOS';

  const saveVehicle = useMutation({
    mutationFn: async () => {
      const payload = {
        ...vehicleForm,
        host_id: host.id,
        year: vehicleForm.year ? Number(vehicleForm.year) : undefined,
        mileage: vehicleForm.mileage ? Number(vehicleForm.mileage) : undefined,
        weekly_rate: vehicleForm.weekly_rate ? Number(vehicleForm.weekly_rate) : undefined,
        monthly_rate: vehicleForm.monthly_rate ? Number(vehicleForm.monthly_rate) : undefined,
        status: selectedVehicle?.status || 'Out of Service',
        approval_status: selectedVehicle?.approval_status || 'pending',
        deployment_type: 'human',
        telematics_provider: selectedVehicle?.telematics_provider || 'none',
        av_platform: selectedVehicle?.av_platform || 'none',
        allow_weekly_booking: true,
        allow_monthly_booking: !!vehicleForm.monthly_rate,
      };
      return selectedVehicle ? base44.entities.Vehicle.update(selectedVehicle.id, payload) : base44.entities.Vehicle.create(payload);
    },
    onSuccess: async (vehicle) => {
      const id = selectedVehicle?.id || vehicle?.id;
      setVehicleId(id);
      await qc.invalidateQueries({ queryKey: ['first-vehicle-setup'] });
      await refetch();
      setCurrentStep(1);
    },
  });

  const uploadComplianceDoc = async (docType, file) => {
    if (!file || !host?.id || !vehicleId) return;
    setDocLoading((previous) => ({ ...previous, [docType]: true }));
    const { file_url } = await uploadFile(file);
    setDocUploads((previous) => ({ ...previous, [docType]: file_url }));
    const vehicle = selectedVehicle || { ...vehicleForm, id: vehicleId };
    const created = await base44.entities.HostVehicleCompliance.create({
      host_id: host.id,
      vehicle_id: vehicleId,
      vehicle_name: `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim(),
      doc_type: docType,
      doc_url: file_url,
      status: 'pending_review',
    });
    await base44.functions.invoke('aiReadComplianceDoc', { doc_url: file_url, doc_type: docType, vehicle_vin: vehicle.vin || null, host_id: host.id, vehicle_id: vehicleId, compliance_id: created.id });
    setDocLoading((previous) => ({ ...previous, [docType]: false }));
    await qc.invalidateQueries({ queryKey: ['first-vehicle-setup'] });
    await refetch();
  };

  const startTrial = useMutation({
    mutationFn: () => base44.functions.invoke('manageHostPlatformPlan', { host_id: host.id, plan_id: data?.plan?.id, mode: planMode }),
    onSuccess: (res) => { if (res.data?.url) window.location.href = res.data.url; },
  });

  const publishVehicle = useMutation({
  mutationFn: async () => {
    const latest = await base44.functions.invoke('getHostVehicleSetupReadiness', { host_id: host.id, vehicle_id: vehicleId });
    if (!latest.data?.publish_ready) throw new Error(`Missing: ${(latest.data?.missing_requirements || []).join(', ')}`);
    // FleetOS Professional: marketplace off by default; all others: on by default
    const marketplace_visible = planMode !== 'fleetos_professional';
    return base44.entities.Vehicle.update(vehicleId, { status: 'Available', approval_status: 'approved', storefront_visible: true, marketplace_visible, admin_marketplace_approved: true });
  },
  onSuccess: () => navigate('/host/dashboard'),
  });

  const setVehicle = (field, value) => setVehicleForm((previous) => ({ ...previous, [field]: value }));

  const decodeVin = async () => {
    if (!vehicleForm.vin || vehicleForm.vin.length < 10) return;
    setDecodingVin(true);
    const res = await base44.functions.invoke('decodeVIN', { vin: vehicleForm.vin });
    if (res.data?.year) setVehicle('year', String(res.data.year));
    if (res.data?.make) setVehicle('make', res.data.make);
    if (res.data?.model) setVehicle('model', res.data.model);
    setDecodingVin(false);
  };

  const uploadVehiclePhoto = async (file) => {
    if (!file) return;
    setImageUploading(true);
    const { file_url } = await uploadFile(file);
    setVehicle('image_url', file_url);
    setImageUploading(false);
  };

  const canSaveVehicle = vehicleForm.vin && vehicleForm.year && vehicleForm.make && vehicleForm.model && vehicleForm.city && vehicleForm.state && (vehicleForm.weekly_rate || vehicleForm.monthly_rate);

  const missingText = useMemo(() => readiness?.missing_requirements?.join(', ') || '', [readiness]);

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Loading setup…</div>;
  if (!host) return <div className="p-6 text-sm text-gray-500">Host account not found.</div>;

  return (
    <div className="space-y-5 text-gray-950">
      <div className="rounded-[2rem] p-5 text-white" style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #e91e8c 140%)' }}>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/50">Guided setup</p>
        <h1 className="mt-1 text-3xl font-black" style={{ fontFamily: 'var(--font-syne)' }}>Get This Vehicle Ready</h1>
        <p className="mt-2 text-sm text-white/70">Add your vehicle once, then complete the missing requirements needed to publish it.</p>
      </div>

      <StepList currentStep={currentStep} setCurrentStep={setCurrentStep} readiness={readiness} />

      <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
        {currentStep === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3"><Car className="h-6 w-6 text-pink-600" /><div><h2 className="text-xl font-black">Vehicle Details</h2><p className="text-sm text-gray-500">VIN, location, mileage, pickup info, and pricing.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex gap-2">
                <input className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.vin} onChange={(e) => setVehicle('vin', e.target.value)} placeholder="VIN" />
                <button type="button" onClick={decodeVin} disabled={decodingVin || !vehicleForm.vin} className="rounded-xl bg-gray-900 px-3 text-xs font-black text-white disabled:opacity-50">{decodingVin ? 'Decoding…' : 'Decode'}</button>
              </div>
              <input className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.mileage} onChange={(e) => setVehicle('mileage', e.target.value)} placeholder="Mileage" type="number" />
              <input className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.year} onChange={(e) => setVehicle('year', e.target.value)} placeholder="Year" type="number" />
              <input className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.make} onChange={(e) => setVehicle('make', e.target.value)} placeholder="Make" />
              <input className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.model} onChange={(e) => setVehicle('model', e.target.value)} placeholder="Model" />
              <input className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.city} onChange={(e) => setVehicle('city', e.target.value)} placeholder="Pickup city" />
              <input className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.state} onChange={(e) => setVehicle('state', e.target.value)} placeholder="State" maxLength="2" />
              <input className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.pickup_address} onChange={(e) => setVehicle('pickup_address', e.target.value)} placeholder="Pickup address" />
              <input className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.weekly_rate} onChange={(e) => setVehicle('weekly_rate', e.target.value)} placeholder="Weekly rate" type="number" />
              <input className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm" value={vehicleForm.monthly_rate} onChange={(e) => setVehicle('monthly_rate', e.target.value)} placeholder="Monthly rate optional" type="number" />
            </div>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 text-sm font-black text-gray-700">
              {imageUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
              {vehicleForm.image_url ? 'Vehicle photo uploaded' : imageUploading ? 'Uploading photo…' : 'Upload Vehicle Photo'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadVehiclePhoto(e.target.files[0])} />
            </label>
            {vehicleForm.image_url && <img src={vehicleForm.image_url} alt="Vehicle" className="h-36 w-full rounded-2xl object-cover" />}
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm font-bold"><input type="checkbox" checked={!!vehicleForm.rent_to_own_eligible} onChange={(e) => setVehicle('rent_to_own_eligible', e.target.checked)} /> Rent-to-own eligible</label>
              <label className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-sm font-bold"><input type="checkbox" checked={!!vehicleForm.contactless_pickup} onChange={(e) => setVehicle('contactless_pickup', e.target.checked)} /> Contactless pickup</label>
            </div>
            <button disabled={!canSaveVehicle || saveVehicle.isPending} onClick={() => saveVehicle.mutate()} className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))' }}>{saveVehicle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Save Vehicle Details</button>
          </div>
        )}

        {[1, 2].includes(currentStep) && (
          <div className="space-y-4">
            <StatusCard title={currentStep === 1 ? 'Registration' : 'Insurance'} item={currentStep === 1 ? readiness?.registration_status : readiness?.insurance_status}>
              <p className="mt-1 text-sm text-gray-600">{currentStep === 1 ? 'Upload Registration' : 'Upload Insurance'} for this vehicle. This is required per vehicle.</p>
            </StatusCard>
            {/* Show warning (not block) when enforcement is OFF */}
            {readiness?.compliance_enforcement_enabled === false && (
              <div className="flex items-start gap-2 rounded-xl border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                Compliance enforcement is currently OFF for testing. You can continue without uploading this document, but it will be required when enforcement is turned ON.
              </div>
            )}
            {!vehicleId ? <p className="text-sm font-bold text-amber-700">Save vehicle details first.</p> : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm font-black text-gray-700">
                {docLoading[currentStep === 1 ? 'registration' : 'insurance'] ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                {docLoading[currentStep === 1 ? 'registration' : 'insurance'] ? 'Reading document…' : currentStep === 1 ? 'Upload Registration' : 'Upload Insurance'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => uploadComplianceDoc(currentStep === 1 ? 'registration' : 'insurance', e.target.files[0])} />
              </label>
            )}
            <button onClick={() => setCurrentStep(currentStep + 1)} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-black text-white">Continue</button>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <IdentityVerificationPanel subjectType="host" subject={host} onVerified={async () => { await refetch(); setCurrentStep(4); }} />
            {readiness?.host_identity_status?.status === 'Done' && <button onClick={() => setCurrentStep(4)} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-black text-white">Continue</button>}
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <StatusCard title="Plan / Subscription" item={readiness?.subscription_status} />
            {readiness?.subscription_status?.status === 'Needed' ? <button disabled={startTrial.isPending} onClick={() => startTrial.mutate()} className="inline-flex items-center gap-2 rounded-2xl bg-gray-950 px-5 py-3 text-sm font-black text-white"><CreditCard className="h-4 w-4" /> {startTrial.isPending ? 'Opening…' : `Start ${paidPlanLabel} 14-Day Trial`}</button> : <button onClick={() => setCurrentStep(5)} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-black text-white">Continue</button>}
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-4">
            <StatusCard title="Payment Setup" item={readiness?.payment_setup_status} />
            {readiness?.payment_setup_status?.status === 'Needed' ? <Link to="/host/payouts" className="inline-flex items-center gap-2 rounded-2xl bg-gray-950 px-5 py-3 text-sm font-black text-white"><CreditCard className="h-4 w-4" /> Connect Stripe</Link> : <button onClick={() => setCurrentStep(6)} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-black text-white">Continue</button>}
          </div>
        )}

        {currentStep === 6 && (
          <div className="space-y-4">
            <StatusCard title="GPS Setup" item={readiness?.gps_status} />
            <InstallerLocatorCTA source="first_vehicle_setup" vehicle={selectedVehicle} title="Find Installer" description="Find a nearby GPS installer if you need help assigning a device." />
            <div className="flex flex-wrap gap-2">
              <Link to="/host/telematics" className="inline-flex items-center gap-2 rounded-2xl bg-gray-950 px-5 py-3 text-sm font-black text-white"><Radio className="h-4 w-4" /> Assign GPS</Link>
              {readiness?.gps_status?.status !== 'Needed' && <button onClick={() => setCurrentStep(7)} className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-black text-gray-800">{readiness?.gps_status?.status === 'Done' ? 'Continue' : 'Skip For Now'}</button>}
            </div>
          </div>
        )}

        {currentStep === 7 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3"><Rocket className="h-6 w-6 text-pink-600" /><div><h2 className="text-xl font-black">Publish Vehicle</h2><p className="text-sm text-gray-500">Final readiness summary before your vehicle goes live.</p></div></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['Vehicle details', readiness?.vehicle_details_status], ['Registration', readiness?.registration_status], ['Insurance', readiness?.insurance_status], ['Host ID verification', readiness?.host_identity_status], ['Plan/trial', readiness?.subscription_status], ['Payment setup', readiness?.payment_setup_status], ['GPS', readiness?.gps_status], ['Storefront visibility', readiness?.storefront_status],
              ].map(([label, item]) => <StatusCard key={label} title={label} item={item} />)}
            </div>
            {publishVehicle.error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{publishVehicle.error.message}</div>}
            {!readiness?.publish_ready && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="font-black text-amber-950">Missing: {missingText}</p><p className="mt-1 text-sm text-amber-700">Use the setup steps above to complete the missing item.</p></div>}
            <button disabled={!readiness?.publish_ready || publishVehicle.isPending} onClick={() => publishVehicle.mutate()} className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white disabled:opacity-50" style={{ background: 'linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))' }}>{publishVehicle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Publish Vehicle</button>
          </div>
        )}
      </div>
    </div>
  );
}