alter policy tf_receive_own_orders on realtime.messages using (extension = 'broadcast' and topic = 'tf:orders:' || (select auth.uid())::text and topic = (select realtime.topic()));
