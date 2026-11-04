-- Reject malformed address scalars even when an owner updates through the Data API.
alter table public.profiles add constraint tf_default_delivery_fields check (
  default_delivery is null or (
    jsonb_typeof(default_delivery->'delivery'->'region') = 'string'
    and jsonb_typeof(default_delivery->'delivery'->'postal') = 'string' and length(default_delivery->'delivery'->>'postal') <= 160
    and jsonb_typeof(default_delivery->'delivery'->'street') = 'string' and length(default_delivery->'delivery'->>'street') <= 300
    and jsonb_typeof(default_delivery->'delivery'->'number') = 'string' and length(default_delivery->'delivery'->>'number') <= 160
    and jsonb_typeof(default_delivery->'delivery'->'complement') = 'string' and length(default_delivery->'delivery'->>'complement') <= 160
    and jsonb_typeof(default_delivery->'delivery'->'district') = 'string' and length(default_delivery->'delivery'->>'district') <= 160
    and jsonb_typeof(default_delivery->'delivery'->'city') = 'string' and length(default_delivery->'delivery'->>'city') <= 160
    and jsonb_typeof(default_delivery->'delivery'->'province') = 'string' and length(default_delivery->'delivery'->>'province') <= 160
    and jsonb_typeof(default_delivery->'delivery'->'reference') = 'string' and length(default_delivery->'delivery'->>'reference') <= 300
    and jsonb_typeof(default_delivery->'delivery'->'instructions') = 'string' and length(default_delivery->'delivery'->>'instructions') <= 500
    and length(btrim(concat(
      default_delivery->'delivery'->>'postal',default_delivery->'delivery'->>'street',default_delivery->'delivery'->>'number',
      default_delivery->'delivery'->>'complement',default_delivery->'delivery'->>'district',default_delivery->'delivery'->>'city',
      default_delivery->'delivery'->>'province',default_delivery->'delivery'->>'reference',default_delivery->'delivery'->>'instructions'
    ))) > 0
    and not (default_delivery->'delivery'->>'noNumber' = 'true' and length(btrim(default_delivery->'delivery'->>'number')) > 0)
  ) is true
);
