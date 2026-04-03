-- 012_add_guest_user.sql
-- Adds a default guest profile for the demo/bypass login mode.

INSERT INTO public.profiles (
  user_id, 
  full_name, 
  county, 
  farm_size, 
  main_crops, 
  bio, 
  phone,
  created_at, 
  updated_at
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Guest Farmer',
  'Nairobi',
  '5 Acres',
  ARRAY['Maize', 'Beans', 'Coffee'],
  'Demo account for exploring the AgriLink X platform. This profile is automatically used when logging in via demo mode.',
  '+254700000000',
  NOW(),
  NOW()
)
ON CONFLICT (user_id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  updated_at = NOW();
