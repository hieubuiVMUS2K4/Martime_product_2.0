--
-- PostgreSQL database dump
--

\restrict fqe6KbNWQ6c1PfJiXcOe7CbHlO47xl45Vg5JnP7ByUpmrrSed5xJSAYhcRqidWQ

-- Dumped from database version 15.14
-- Dumped by pg_dump version 15.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: countries; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.countries VALUES (2, 'USA', 'United States', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (3, 'GBR', 'United Kingdom', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (4, 'JPN', 'Japan', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (5, 'SGP', 'Singapore', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (6, 'PAN', 'Panama', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (7, 'LBR', 'Liberia', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (8, 'MHL', 'Marshall Islands', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (9, 'NOR', 'Norway', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (10, 'GRC', 'Greece', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (11, 'PHL', 'Philippines', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (12, 'KOR', 'South Korea', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (13, 'CHN', 'China', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (14, 'IND', 'India', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (15, 'IDN', 'Indonesia', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);
INSERT INTO public.countries VALUES (1, 'VNM', 'Vietnam', true, '2026-02-26 03:45:33.623853+00', '2026-02-26 03:45:33.623853+00', NULL);


--
-- Data for Name: drill_types; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.drill_types VALUES ('410931c6-8c00-42b2-af14-d5071bd60679', 'ABANDON_SHIP_MONTHLY', 'Abandon ship drill (SOLAS III 19.3.2 & 19.3.4)', NULL, 'STATION_DRILLS', 'SOLAS III 19.3.2 & 19.3.4', 'At least once every month', 'MONTHLY', 30, 'ROUTINE', NULL, 7, 'MASTER', '<p><strong>ABANDON SHIP DRILL:</strong> Launch lifeboats with crew and maneuver in water at least once every three months</p>', true, false, false, false, false, false, true, 1, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('98dbe242-7017-44a3-8fca-c6df47bb0d52', 'ABANDON_SHIP_ON_DEPARTURE', 'Abandon ship drill - Within 24h after departure *1', NULL, 'STATION_DRILLS', 'SOLAS III 19.3.2 & 19.3.4', 'Within 24 hours after departure *1', 'ON_EVENT', NULL, 'ON_DEPARTURE', 1, 0, 'MASTER', '<p><strong>*1 TRIGGER:</strong> If >25% crew turnover, conduct within 24h of departure</p>', false, false, false, false, false, false, true, 2, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('538e6701-d447-4944-8d59-904c44995936', 'FIRE_DRILL_MONTHLY', 'Fire-fighting drill (SOLAS III 19.3.2)', NULL, 'STATION_DRILLS', 'SOLAS III 19.3.2', 'At least once every month', 'MONTHLY', 30, 'ROUTINE', NULL, 7, 'CHIEF_OFFICER', '<p><strong>FIRE DRILL:</strong> Train various scenarios - engine room, accommodation, galley, cargo hold. EVERY DRILL NEEDS MASTER APPROVAL</p>', true, false, false, false, false, false, true, 3, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('93a4860f-dd52-4e80-8dc0-7a3fdb426a57', 'FIRE_DRILL_ON_DEPARTURE', 'Fire-fighting drill - Within 24h after departure *1', NULL, 'STATION_DRILLS', 'SOLAS III 19.3.2', 'Within 24 hours after departure *1', 'ON_EVENT', NULL, 'ON_DEPARTURE', 1, 0, 'CHIEF_OFFICER', '<p><strong>*1 TRIGGER:</strong> If >25% crew turnover</p>', false, false, false, false, false, false, true, 4, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('7c290941-9b80-43f9-8dfb-04dbc92cbedd', 'RESCUE_BOAT_QUARTERLY', 'Rescue boat drill (Launching & maneuvering)', NULL, 'STATION_DRILLS', 'SOLAS III 19.3.4.6', 'Each month (at least once every 3 months)', 'MONTHLY', 30, NULL, NULL, 7, 'CHIEF_OFFICER', NULL, true, false, false, false, false, false, true, 5, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('3b56a00a-bdda-43f7-a258-3ba452b91290', 'ENCLOSED_SPACE_BIMONTHLY', 'Enclosed space entry and rescue drill', NULL, 'STATION_DRILLS', 'SOLAS III 19.3.3 & 19.3.6', 'At least once every 2 months', 'BI_MONTHLY', 60, NULL, NULL, 7, 'CHIEF_OFFICER', NULL, true, false, false, false, false, false, true, 6, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('38166e78-3ec5-4a73-89b5-667b083ab48f', 'EMERGENCY_RESPONSE_ANNUAL', 'Emergency response drill', NULL, 'EXERCISES', 'SOLAS III 19', 'At least once per year', 'ANNUAL', 365, NULL, NULL, 30, 'MASTER', NULL, true, false, false, false, false, false, true, 7, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('5edea84e-9ff6-4fd0-8ca0-1619176c6d59', 'CYBER_SECURITY_QUARTERLY', 'Cyber security drill', NULL, 'EXERCISES', 'IMO MSC-FAL.1/Circ.3', 'At least 3 times per year', 'QUARTERLY', 120, NULL, NULL, 14, 'MASTER', NULL, true, false, false, false, false, false, true, 8, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('af3121a9-ff65-4e20-9b54-ddd412303592', 'LIFESAVING_FIRE_TRAINING_MONTHLY', 'Life-saving and Fire equipment training', NULL, 'EDUCATION', 'SOLAS III 19.2.3', 'At least once every month', 'MONTHLY', 30, NULL, NULL, 7, 'CHIEF_OFFICER', NULL, true, false, false, false, false, false, true, 9, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('484ce74c-2853-4b4a-a2a4-d3027bf11f67', 'LIFESAVING_FIRE_TRAINING_ON_NEW_CREW', 'Life-saving/Fire training - New crew (within 2 weeks)', NULL, 'EDUCATION', 'SOLAS III 19.2.3', 'Within 2 weeks of joining', 'ON_EVENT', NULL, 'ON_NEW_CREW', 14, 3, 'CHIEF_OFFICER', NULL, false, false, false, false, false, false, true, 10, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('3f6ad25a-e88a-4be9-87d7-26edc79928bf', 'FAMILIARIZATION_ON_JOINING', 'Familiarization training (upon joining)', NULL, 'TRAINING', 'SOLAS VI/1 & STCW A-I/6', 'Upon joining', 'ON_EVENT', NULL, 'ON_NEW_CREW', 1, 0, 'MASTER', NULL, false, false, false, false, false, false, true, 11, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('3b7e5696-7e76-413b-8e0a-cc9334ddba84', 'FIRE_LINE_HOSES_ANNUAL', 'Fire Line and Fire Hoses check', NULL, 'CHECKS', 'SOLAS II-2/10.2.1.6', 'At least once per year', 'ANNUAL', 365, NULL, NULL, 30, 'CHIEF_OFFICER', NULL, true, false, false, false, false, false, true, 12, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('ce9eb584-5166-4f4a-b316-ee8db8d9a087', 'SECURITY_DRILL_QUARTERLY', 'Security Drill (ISPS)', NULL, 'ISPS', 'ISPS Code A/13.4', 'At least once every 3 months (not exceeding 18 months)', 'QUARTERLY', 90, NULL, NULL, 14, 'MASTER', NULL, true, false, false, false, false, false, true, 13, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('6916a3c0-9872-422e-b918-c34b2ecc8116', 'SECURITY_DRILL_ON_NEW_CREW', 'Security Drill - New crew (within 1 week) *1', NULL, 'ISPS', 'ISPS Code A/13.4', 'Within 1 week for new crew *1', 'ON_EVENT', NULL, 'ON_NEW_CREW', 7, 1, 'MASTER', NULL, false, false, false, false, false, false, true, 14, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');
INSERT INTO public.drill_types VALUES ('ea0104b4-0b83-4f2a-9635-7fb3ec8c983e', 'SECURITY_EXERCISE_ANNUAL', 'Security Exercise (ISPS)', NULL, 'ISPS', 'ISPS Code A/13.5', 'At least once per year (not exceeding 18 months)', 'ANNUAL', 365, NULL, NULL, 30, 'MASTER', NULL, true, false, false, false, false, false, true, 15, true, '2026-02-26 02:33:33.663252+00', '2026-02-26 02:33:33.663252+00');


--
-- Data for Name: equipment_groups; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.equipment_groups VALUES ('cccccccc-1111-1111-1111-000000000001', 'GRP-LIFESAVING', 'Thiết Bị Cứu Sinh', 'SAFETY_EQUIPMENT', 'DECK', 'C/O', 'CREW002', 'Tất cả thiết bị cứu sinh (xuồng và bè cứu sinh)', true, false, '2026-01-13 18:43:07.083825+00', '2026-01-13 18:43:07.083825+00', 'SHIP_01');
INSERT INTO public.equipment_groups VALUES ('cccccccc-1111-1111-1111-000000000002', 'GRP-FIREFIGHTING', 'Thiết Bị PCCC', 'SAFETY_EQUIPMENT', 'ENGINE', 'C/E', 'CREW005', 'Hệ thống chữa cháy cố định', true, false, '2026-01-13 18:43:07.083825+00', '2026-01-13 18:43:07.083825+00', 'SHIP_01');
INSERT INTO public.equipment_groups VALUES ('cccccccc-1111-1111-1111-000000000003', 'GRP-MOORING', 'Thiết Bị Bu-lông', 'DECK_MACHINERY', 'DECK', 'Bosun', 'CREW009', 'Tất cả tời neo (mũi và đuôi)', true, false, '2026-01-13 18:43:07.083825+00', '2026-01-13 18:43:07.083825+00', 'SHIP_01');
INSERT INTO public.equipment_groups VALUES ('cccccccc-1111-1111-1111-000000000004', 'GRP-DECK-PAINT', 'Khu Vực Sơn Boong', 'DECK_STRUCTURE', 'DECK', 'Bosun', 'CREW009', 'Khu vực boong cần chống gỉ và sơn định kỳ', true, false, '2026-01-13 18:43:07.083825+00', '2026-01-13 18:43:07.083825+00', 'SHIP_01');


--
-- Data for Name: material_categories; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.material_categories VALUES (1, 'ENGINE', 'Phụ Tùng Động Cơ', 'Phụ tùng và linh kiện cho động cơ chính và động cơ phụ', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (2, 'ELECTRICAL', 'Vật Tư Điện', 'Thiết bị điện, cáp, công tắc, đèn chiếu sáng', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (31, 'PLUMBING', 'Dụng Cụ Ống Nối', 'Van, ống, đầu nối, gasket cho hệ thống đường ống', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (4, 'PAINT-COAT', 'Sơn & Chống Ăn Mòn', 'Sơn tàu biển, sơn lót, dung môi, vật liệu chống ăn mòn', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (5, 'LUBRICANTS', 'Dầu Mỡ & Chất Lỏng', 'Dầu nhờn, mỡ bôi trơn, dầu thủy lực, chất làm mát', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (6, 'SAFETY', 'Thiết Bị An Toàn', 'Thiết bị bảo hộ cá nhân, thiết bị cứu sinh, PCCC', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (7, 'TOOLS', 'Dụng Cụ & Công Cụ', 'Dụng cụ cầm tay, dụng cụ điện, thiết bị đo lường', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (8, 'DECK-SUPPLIES', 'Vật Tư Boong', 'Dây cáp, xích, móc, thiết bị boong', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (9, 'CLEANING', 'Vật Tư Làm Sạch', 'Hóa chất làm sạch, giẻ lau, bàn chải, thiết bị vệ sinh', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (10, 'OFFICE', 'Văn Phòng & Văn Phẩm', 'Giấy tờ, bút, mực in, thiết bị văn phòng', NULL, true, false, '2026-01-13 18:40:54.24721+00');
INSERT INTO public.material_categories VALUES (11, 'ENGINE-FILTERS', 'Lọc Động Cơ', 'Lọc dầu, lọc nhiên liệu, lọc không khí', 1, true, false, '2026-01-13 18:41:00.356414+00');
INSERT INTO public.material_categories VALUES (12, 'ENGINE-GASKETS', 'Gioăng & Đệm', 'Gioăng đầu máy, gioăng bô, O-ring', 1, true, false, '2026-01-13 18:41:00.356414+00');
INSERT INTO public.material_categories VALUES (13, 'ENGINE-BEARINGS', 'Ổ Trục & Bạc', 'Bạc trục khuỷu, bạc đại, ổ bi', 1, true, false, '2026-01-13 18:41:00.356414+00');
INSERT INTO public.material_categories VALUES (14, 'ENGINE-VALVES', 'Van & Xupap', 'Van xupap, lò xo van, cần đẩy', 1, true, false, '2026-01-13 18:41:00.356414+00');
INSERT INTO public.material_categories VALUES (15, 'ENGINE-COOLING', 'Hệ Thống Làm Mát', 'Bơm nước, nhiệt kế, van điều nhiệt', 1, true, false, '2026-01-13 18:41:00.356414+00');
INSERT INTO public.material_categories VALUES (21, 'ELEC-LIGHTING', 'Chiếu Sáng', 'Đèn LED, bóng đèn, đèn pha, đèn tín hiệu', 2, true, false, '2026-01-13 18:41:04.776727+00');
INSERT INTO public.material_categories VALUES (22, 'ELEC-CABLES', 'Cáp & Dây Điện', 'Cáp nguồn, cáp tín hiệu, đầu nối cáp', 2, true, false, '2026-01-13 18:41:04.776727+00');
INSERT INTO public.material_categories VALUES (23, 'ELEC-SWITCHES', 'Công Tắc & Ổ Cắm', 'Công tắc, ổ cắm, MCB, MCCB', 2, true, false, '2026-01-13 18:41:04.776727+00');
INSERT INTO public.material_categories VALUES (24, 'ELEC-BATTERIES', 'Ắc Quy & Pin', 'Ắc quy khởi động, pin sạc, bộ sạc', 2, true, false, '2026-01-13 18:41:04.776727+00');
INSERT INTO public.material_categories VALUES (41, 'PAINT-PRIMERS', 'Sơn Lót', 'Sơn lót chống gỉ, sơn lót epoxy, sơn lót kẽm', 4, true, false, '2026-01-13 18:41:10.149152+00');
INSERT INTO public.material_categories VALUES (42, 'PAINT-TOPCOATS', 'Sơn Phủ', 'Sơn phủ ngoại thất, sơn boong, sơn chống trượt', 4, true, false, '2026-01-13 18:41:10.149152+00');
INSERT INTO public.material_categories VALUES (43, 'PAINT-SUPPLIES', 'Phụ Kiện Sơn', 'Cọ, lăn, dung môi, giấy nhám', 4, true, false, '2026-01-13 18:41:10.149152+00');
INSERT INTO public.material_categories VALUES (51, 'LUBE-ENGINE-OIL', 'Dầu Động Cơ', 'Dầu động cơ diesel, dầu 2 thì, dầu turbo', 5, true, false, '2026-01-13 18:41:14.828413+00');
INSERT INTO public.material_categories VALUES (52, 'LUBE-GREASE', 'Mỡ Bôi Trơn', 'Mỡ lithium, mỡ chịu nhiệt, mỡ chống nước', 5, true, false, '2026-01-13 18:41:14.828413+00');
INSERT INTO public.material_categories VALUES (53, 'LUBE-HYDRAULIC', 'Dầu Thủy Lực', 'Dầu thủy lực ISO, dầu bánh răng', 5, true, false, '2026-01-13 18:41:14.828413+00');
INSERT INTO public.material_categories VALUES (54, 'LUBE-COOLANT', 'Chất Làm Mát', 'Nước làm mát động cơ, chống đông', 5, true, false, '2026-01-13 18:41:14.828413+00');
INSERT INTO public.material_categories VALUES (61, 'SAFETY-PPE', 'Bảo Hộ Lao Động', 'Mũ, găng tay, giày, áo phao, kính bảo hộ', 6, true, false, '2026-01-13 18:41:19.029639+00');
INSERT INTO public.material_categories VALUES (62, 'SAFETY-FIRE', 'Phòng Cháy Chữa Cháy', 'Bình cứu hỏa, khăn chữa cháy, pháo sáng', 6, true, false, '2026-01-13 18:41:19.029639+00');
INSERT INTO public.material_categories VALUES (63, 'SAFETY-MEDICAL', 'Y Tế & Sơ Cứu', 'Hộp sơ cứu, băng bó, thuốc men', 6, true, false, '2026-01-13 18:41:19.029639+00');


--
-- Data for Name: ports; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.ports VALUES (1, 'VNSGN', 'Ho Chi Minh City (Saigon)', 'Vietnam', 'VN', 10.7769, 106.7009, 'Asia/Ho_Chi_Minh', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (2, 'VNHPH', 'Hai Phong', 'Vietnam', 'VN', 20.8449, 106.6881, 'Asia/Ho_Chi_Minh', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (3, 'VNDAD', 'Da Nang', 'Vietnam', 'VN', 16.0544, 108.2022, 'Asia/Ho_Chi_Minh', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (4, 'VNVUT', 'Vung Tau', 'Vietnam', 'VN', 10.346, 107.0843, 'Asia/Ho_Chi_Minh', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (5, 'VNQNH', 'Quy Nhon', 'Vietnam', 'VN', 13.7563, 109.22, 'Asia/Ho_Chi_Minh', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (6, 'VNCMR', 'Cam Ranh', 'Vietnam', 'VN', 11.9214, 109.159, 'Asia/Ho_Chi_Minh', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (7, 'SGSIN', 'Singapore', 'Singapore', 'SG', 1.2644, 103.8222, 'Asia/Singapore', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (8, 'CNSHA', 'Shanghai', 'China', 'CN', 31.2304, 121.4737, 'Asia/Shanghai', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (9, 'CNSHE', 'Shenzhen (Shekou)', 'China', 'CN', 22.4814, 113.8671, 'Asia/Shanghai', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (10, 'CNNGB', 'Ningbo-Zhoushan', 'China', 'CN', 29.8683, 121.544, 'Asia/Shanghai', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (11, 'CNQIN', 'Qingdao', 'China', 'CN', 36.0671, 120.3826, 'Asia/Shanghai', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (12, 'CNTXG', 'Tianjin (Xingang)', 'China', 'CN', 38.986, 117.7278, 'Asia/Shanghai', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (13, 'CNDLC', 'Dalian', 'China', 'CN', 38.914, 121.6147, 'Asia/Shanghai', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (14, 'CNXMN', 'Xiamen', 'China', 'CN', 24.4798, 118.0894, 'Asia/Shanghai', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (15, 'HKHKG', 'Hong Kong', 'Hong Kong', 'HK', 22.2855, 114.1577, 'Asia/Hong_Kong', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (16, 'JPTYO', 'Tokyo', 'Japan', 'JP', 35.6528, 139.8395, 'Asia/Tokyo', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (17, 'JPYOK', 'Yokohama', 'Japan', 'JP', 35.4437, 139.638, 'Asia/Tokyo', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (18, 'JPKOB', 'Kobe', 'Japan', 'JP', 34.6901, 135.1956, 'Asia/Tokyo', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (19, 'JPNGO', 'Nagoya', 'Japan', 'JP', 35.088, 136.8815, 'Asia/Tokyo', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (20, 'JPOSA', 'Osaka', 'Japan', 'JP', 34.6516, 135.4325, 'Asia/Tokyo', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (21, 'KRPUS', 'Busan', 'South Korea', 'KR', 35.1028, 129.0327, 'Asia/Seoul', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (22, 'KRINC', 'Incheon', 'South Korea', 'KR', 37.4563, 126.7052, 'Asia/Seoul', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (23, 'TWKHH', 'Kaohsiung', 'Taiwan', 'TW', 22.6163, 120.3133, 'Asia/Taipei', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (24, 'TWKEL', 'Keelung', 'Taiwan', 'TW', 25.1276, 121.7392, 'Asia/Taipei', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (25, 'MYPKG', 'Port Klang', 'Malaysia', 'MY', 3, 101.38, 'Asia/Kuala_Lumpur', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (26, 'MYTPP', 'Tanjung Pelepas', 'Malaysia', 'MY', 1.3667, 103.55, 'Asia/Kuala_Lumpur', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (27, 'THBKK', 'Bangkok (Laem Chabang)', 'Thailand', 'TH', 13.0778, 100.8842, 'Asia/Bangkok', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (28, 'THLCH', 'Laem Chabang', 'Thailand', 'TH', 13.0819, 100.8931, 'Asia/Bangkok', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (29, 'IDJKT', 'Jakarta (Tanjung Priok)', 'Indonesia', 'ID', -6.1048, 106.88, 'Asia/Jakarta', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (30, 'IDBLW', 'Belawan', 'Indonesia', 'ID', 3.7833, 98.6833, 'Asia/Jakarta', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (31, 'PHMNL', 'Manila', 'Philippines', 'PH', 14.5833, 120.9667, 'Asia/Manila', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (32, 'MMRGN', 'Yangon', 'Myanmar', 'MM', 16.85, 96.1667, 'Asia/Yangon', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (33, 'KHPNH', 'Phnom Penh', 'Cambodia', 'KH', 11.5564, 104.9282, 'Asia/Phnom_Penh', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (34, 'INMAA', 'Chennai (Madras)', 'India', 'IN', 13.0827, 80.2707, 'Asia/Kolkata', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (35, 'INNSA', 'Nhava Sheva (Mumbai)', 'India', 'IN', 18.95, 72.95, 'Asia/Kolkata', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (36, 'LKCMB', 'Colombo', 'Sri Lanka', 'LK', 6.9497, 79.8428, 'Asia/Colombo', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (37, 'AEJEA', 'Jebel Ali (Dubai)', 'UAE', 'AE', 25.0174, 55.0628, 'Asia/Dubai', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (38, 'SAJED', 'Jeddah', 'Saudi Arabia', 'SA', 21.4858, 39.1925, 'Asia/Riyadh', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (39, 'OMSLL', 'Salalah', 'Oman', 'OM', 16.9434, 54.0025, 'Asia/Muscat', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (40, 'NLRTM', 'Rotterdam', 'Netherlands', 'NL', 51.9244, 4.4777, 'Europe/Amsterdam', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (41, 'BEANR', 'Antwerp', 'Belgium', 'BE', 51.2194, 4.4025, 'Europe/Brussels', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (42, 'DEHAM', 'Hamburg', 'Germany', 'DE', 53.5461, 9.9669, 'Europe/Berlin', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (43, 'DEBRV', 'Bremerhaven', 'Germany', 'DE', 53.5396, 8.5809, 'Europe/Berlin', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (44, 'GBFXT', 'Felixstowe', 'United Kingdom', 'GB', 51.9536, 1.3511, 'Europe/London', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (45, 'GBLGP', 'London Gateway', 'United Kingdom', 'GB', 51.505, 0.4583, 'Europe/London', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (46, 'FRLEH', 'Le Havre', 'France', 'FR', 49.4944, 0.1079, 'Europe/Paris', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (47, 'ESALG', 'Algeciras', 'Spain', 'ES', 36.1309, -5.4433, 'Europe/Madrid', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (48, 'ESVLC', 'Valencia', 'Spain', 'ES', 39.4453, -0.324, 'Europe/Madrid', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (49, 'ITGOA', 'Genoa', 'Italy', 'IT', 44.4056, 8.9463, 'Europe/Rome', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (50, 'GRPIR', 'Piraeus', 'Greece', 'GR', 37.9475, 23.637, 'Europe/Athens', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (51, 'TRIST', 'Istanbul (Ambarli)', 'Turkey', 'TR', 40.9667, 28.6833, 'Europe/Istanbul', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (52, 'EGPSD', 'Port Said', 'Egypt', 'EG', 31.2565, 32.2841, 'Africa/Cairo', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (53, 'EGSKH', 'Suez (El-Sukhna)', 'Egypt', 'EG', 29.6, 32.3167, 'Africa/Cairo', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (54, 'MAPTM', 'Tanger Med', 'Morocco', 'MA', 35.8889, -5.5, 'Africa/Casablanca', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (55, 'USLAX', 'Los Angeles / Long Beach', 'United States', 'US', 33.7406, -118.2712, 'America/Los_Angeles', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (56, 'USNYC', 'New York / New Jersey', 'United States', 'US', 40.6693, -74.0446, 'America/New_York', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (57, 'USSAV', 'Savannah', 'United States', 'US', 32.0809, -81.0912, 'America/New_York', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (58, 'USHOU', 'Houston', 'United States', 'US', 29.726, -95.269, 'America/Chicago', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (59, 'CAHAL', 'Halifax', 'Canada', 'CA', 44.6488, -63.5752, 'America/Halifax', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (60, 'CAVAN', 'Vancouver', 'Canada', 'CA', 49.289, -123.1115, 'America/Vancouver', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (61, 'BRSSZ', 'Santos', 'Brazil', 'BR', -23.9608, -46.334, 'America/Sao_Paulo', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (62, 'PAPCN', 'Panama Canal (Colon)', 'Panama', 'PA', 9.3545, -79.9019, 'America/Panama', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (63, 'AUSYD', 'Sydney', 'Australia', 'AU', -33.8587, 151.214, 'Australia/Sydney', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (64, 'AUMEL', 'Melbourne', 'Australia', 'AU', -37.8275, 144.925, 'Australia/Melbourne', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (65, 'NZAKL', 'Auckland', 'New Zealand', 'NZ', -36.8404, 174.74, 'Pacific/Auckland', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (66, 'ZADUR', 'Durban', 'South Africa', 'ZA', -29.8706, 31.0447, 'Africa/Johannesburg', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (67, 'DJJIB', 'Djibouti', 'Djibouti', 'DJ', 11.5951, 43.1458, 'Africa/Djibouti', true, '2026-02-21 04:16:57.221052+00', '2026-02-21 04:16:57.221052+00', false, '', 0);
INSERT INTO public.ports VALUES (135, 'AEAUH', 'Abu Dhabi', 'UAE', 'AE', 24.4539, 54.3773, 'Asia/Dubai', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (136, 'QAHMD', 'Hamad Port', 'Qatar', 'QA', 25.015, 51.61, 'Asia/Qatar', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (137, 'KWIQE', 'Shuaiba', 'Kuwait', 'KW', 29.0392, 48.146, 'Asia/Kuwait', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (138, 'PKKHI', 'Karachi', 'Pakistan', 'PK', 24.8607, 67.0011, 'Asia/Karachi', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (139, 'BDCGP', 'Chattogram', 'Bangladesh', 'BD', 22.335, 91.8325, 'Asia/Dhaka', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (140, 'INMUN', 'Mundra', 'India', 'IN', 22.839, 69.721, 'Asia/Kolkata', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (141, 'USOAK', 'Oakland', 'United States', 'US', 37.8044, -122.2712, 'America/Los_Angeles', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (142, 'USSEA', 'Seattle', 'United States', 'US', 47.6062, -122.3321, 'America/Los_Angeles', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (143, 'COCTG', 'Cartagena', 'Colombia', 'CO', 10.391, -75.4794, 'America/Bogota', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (144, 'CLVAP', 'Valparaiso', 'Chile', 'CL', -33.0472, -71.6127, 'America/Santiago', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (145, 'PECLL', 'Callao', 'Peru', 'PE', -12.0464, -77.1428, 'America/Lima', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (146, 'ARBUE', 'Buenos Aires', 'Argentina', 'AR', -34.6037, -58.3816, 'America/Argentina/Buenos_Aires', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (147, 'MXZLO', 'Manzanillo', 'Mexico', 'MX', 19.0501, -104.3188, 'America/Mexico_City', true, '2026-03-15 10:28:17.301318+00', '2026-03-15 10:28:17.301318+00', false, '', 0);
INSERT INTO public.ports VALUES (148, 'Z1729', 'Sync Test Port Z1729', 'Testland', 'TS', 10.123, 106.456, 'UTC+7', true, '2026-03-15 13:30:37.142281+00', '2026-03-15 13:30:37.142281+00', false, 'SHIP_01', 0);
INSERT INTO public.ports VALUES (149, 'Z6097', 'Sync Test Port Z6097', 'Testland', 'TS', 10.123, 106.456, 'UTC+7', true, '2026-03-15 13:31:02.685455+00', '2026-03-15 13:31:02.685455+00', false, 'SHIP_01', 0);
INSERT INTO public.ports VALUES (150, 'Z7954', 'Sync Test Port Z7954', 'Testland', 'TS', 10.123, 106.456, 'UTC+7', true, '2026-03-15 13:31:36.199732+00', '2026-03-15 13:31:36.199732+00', false, 'SHIP_01', 0);


--
-- Data for Name: ranks; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.ranks VALUES (24, 'OILR', 'Oiler', true, '2026-03-10 03:34:57.737316+00', 'Engine', 11, '2026-03-10 03:34:57.737316+00');
INSERT INTO public.ranks VALUES (11, '3/E', 'Third Engineer', true, '-infinity', '', 0, '-infinity');
INSERT INTO public.ranks VALUES (12, 'ELEC', 'Electrician', true, '-infinity', '', 0, '-infinity');
INSERT INTO public.ranks VALUES (1, 'MAST', 'Master (Captain)', true, '2026-03-22 13:54:55.359347+00', 'DECK', 0, '2026-03-22 13:54:55.359348+00');
INSERT INTO public.ranks VALUES (2, 'C/O', 'Chief Officer', true, '2026-03-22 13:54:55.359348+00', 'DECK', 0, '2026-03-22 13:54:55.359348+00');
INSERT INTO public.ranks VALUES (3, '2/O', 'Second Officer', true, '2026-03-22 13:54:55.359348+00', 'DECK', 0, '2026-03-22 13:54:55.359348+00');
INSERT INTO public.ranks VALUES (4, '3/O', 'Third Officer', true, '2026-03-22 13:54:55.359349+00', 'DECK', 0, '2026-03-22 13:54:55.359349+00');
INSERT INTO public.ranks VALUES (5, 'C/E', 'Chief Engineer', true, '2026-03-22 13:54:55.359349+00', 'DECK', 0, '2026-03-22 13:54:55.359349+00');
INSERT INTO public.ranks VALUES (6, '2/E', 'Second Engineer', true, '2026-03-22 13:54:55.359349+00', 'DECK', 0, '2026-03-22 13:54:55.359349+00');
INSERT INTO public.ranks VALUES (7, 'BOSN', 'Bosun', true, '2026-03-22 13:54:55.359349+00', 'DECK', 0, '2026-03-22 13:54:55.359349+00');
INSERT INTO public.ranks VALUES (8, 'AB', 'Able Seaman', true, '2026-03-22 13:54:55.35935+00', 'DECK', 0, '2026-03-22 13:54:55.35935+00');
INSERT INTO public.ranks VALUES (9, 'OILR', 'Oiler', true, '2026-03-22 13:54:55.35935+00', 'DECK', 0, '2026-03-22 13:54:55.35935+00');
INSERT INTO public.ranks VALUES (10, 'COOK', 'Chief Cook', true, '2026-03-22 13:54:55.35935+00', 'DECK', 0, '2026-03-22 13:54:55.35935+00');
INSERT INTO public.ranks VALUES (21, 'BOSN', 'Bosun', true, '2026-03-10 03:34:57.737316+00', 'Deck', 8, '2026-03-10 03:34:57.737316+00');
INSERT INTO public.ranks VALUES (22, 'AB', 'Able Seaman', true, '2026-03-10 03:34:57.737316+00', 'Deck', 9, '2026-03-10 03:34:57.737316+00');
INSERT INTO public.ranks VALUES (23, 'OS', 'Ordinary Seaman', true, '2026-03-10 03:34:57.737316+00', 'Deck', 10, '2026-03-10 03:34:57.737316+00');
INSERT INTO public.ranks VALUES (25, 'COOK', 'Chief Cook', true, '2026-03-10 03:34:57.737316+00', 'Catering', 12, '2026-03-10 03:34:57.737316+00');
INSERT INTO public.ranks VALUES (26, 'ELEC', 'Electrician', true, '2026-03-10 03:34:57.737316+00', 'Engine', 13, '2026-03-10 03:34:57.737316+00');
INSERT INTO public.ranks VALUES (17, '3/O', 'Third Officer', true, '2026-03-10 03:34:57.737316+00', 'Deck', 4, '2026-03-10 03:34:57.737316+00');
INSERT INTO public.ranks VALUES (13, 'PMAN', 'Pumpman', true, '-infinity', '', 0, '-infinity');
INSERT INTO public.ranks VALUES (14, 'FITT', 'Fitter', true, '-infinity', '', 0, '-infinity');
INSERT INTO public.ranks VALUES (15, 'WPER', 'Wiper', true, '-infinity', '', 0, '-infinity');
INSERT INTO public.ranks VALUES (16, 'MSMN', 'Messman', true, '-infinity', '', 0, '-infinity');
INSERT INTO public.ranks VALUES (18, 'CADT', 'Cadet (Deck)', true, '-infinity', '', 0, '-infinity');
INSERT INTO public.ranks VALUES (19, 'ECDT', 'Cadet (Engine)', true, '-infinity', '', 0, '-infinity');
INSERT INTO public.ranks VALUES (20, 'STWD', 'Steward', true, '-infinity', '', 0, '-infinity');


--
-- Data for Name: report_types; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.report_types VALUES (1, 'NOON', 'Noon Report', 'OPERATIONAL', 'Daily noon position report with weather, fuel consumption, and voyage progress', 'SOLAS V/28 - Ship Reporting Systems', 'DAILY', true, true, NULL, true, '2025-12-24 09:46:33.483923+00');
INSERT INTO public.report_types VALUES (2, 'DEPARTURE', 'Departure Report', 'OPERATIONAL', 'Report filed upon departure from port including bunkers, cargo, and crew', 'SOLAS V/28 - Ship Reporting Systems', 'VOYAGE', true, true, NULL, true, '2025-12-24 11:35:51.786955+00');
INSERT INTO public.report_types VALUES (3, 'ARRIVAL', 'Arrival Report', 'OPERATIONAL', 'Report filed upon arrival at port including voyage summary and cargo status', 'SOLAS V/28 - Ship Reporting Systems', 'VOYAGE', true, true, NULL, true, '2025-12-24 11:35:51.786955+00');
INSERT INTO public.report_types VALUES (4, 'BUNKER', 'Bunker Delivery Report', 'OPERATIONAL', 'Report of bunker fuel delivery with BDN (Bunker Delivery Note) details', 'MARPOL Annex VI - Regulation 18', 'EVENT_BASED', true, true, NULL, true, '2025-12-24 11:35:51.786955+00');
INSERT INTO public.report_types VALUES (5, 'POSITION', 'Position Report', 'OPERATIONAL', 'Ship position report for shore monitoring and fleet tracking', 'SOLAS V/19 - Carriage requirements', 'EVENT_BASED', false, false, NULL, true, '2025-12-24 11:35:51.786955+00');


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.roles VALUES (1, 'ADMIN', 'Administrator', 'Full system access', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (2, 'MASTER', 'Master', 'Ship Master - Captain', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (3, 'CE', 'Chief Engineer', 'Chief Engineer', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (4, 'CO', 'Chief Officer', 'Chief Officer', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (5, '2E', 'Second Engineer', 'Second Engineer', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (6, '2O', 'Second Officer', 'Second Officer', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (7, '3E', 'Third Engineer', 'Third Engineer', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (8, '3O', 'Third Officer', 'Third Officer', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (9, 'BOSUN', 'Boatswain', 'Boatswain', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (10, 'CREW', 'Crew', 'General Crew', true, '2025-12-11 13:30:53.446107+00');
INSERT INTO public.roles VALUES (11, 'USER', 'User', 'Regular crew member', true, '2026-02-04 07:42:58.544131+00');



--
-- Data for Name: ship_load_lines; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.ship_load_lines VALUES ('0a62471a-544f-4594-a17d-690c1844a861', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Tropical Fresh Water (TF)', 13.9, NULL, 88500, 66000, 5);
INSERT INTO public.ship_load_lines VALUES ('59410de6-b768-4c2b-951e-85a5ffce87bc', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'T', 14.7, NULL, 95200, 72700, 1);
INSERT INTO public.ship_load_lines VALUES ('6c53db5a-729b-4679-9d48-99dc7485d4d8', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Fresh Water (F)', 14.2, NULL, 91000, 68500, 4);
INSERT INTO public.ship_load_lines VALUES ('b5005dd8-2b65-4a4e-9c85-b8551d72647c', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Tropical (T)', 14.68, NULL, 95000, 72500, 2);
INSERT INTO public.ship_load_lines VALUES ('b9e31edd-a441-463e-9c56-43f0bd765daf', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Tropical (T)', 14.85, NULL, 96500, 74000, 0);
INSERT INTO public.ship_load_lines VALUES ('dc1b2787-ac8f-41d0-b2ed-25014af35e36', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'S', 14.5, 3.7, 93500, 71000, 3);


--
-- Data for Name: ship_main_engines; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.ship_main_engines VALUES ('43403dbe-b57a-4433-a538-4ffeef14f2d8', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'MAN B&W 11G95ME-C9.5', 'HFO/VLSFO', 57200, 62800, 0);


--
-- Data for Name: ship_pilot_card_data; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.ship_pilot_card_data VALUES ('0ae08c74-ec5f-4595-9208-54ce6ca211c2', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Dead Slow Ahead', 35, 6.5, 7.2, 3);
INSERT INTO public.ship_pilot_card_data VALUES ('414cfe05-7539-4708-82b8-800b3f46806d', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Dead Slow Astern', 35, 4, 4.5, 4);
INSERT INTO public.ship_pilot_card_data VALUES ('4a309610-cd5a-46e9-8b23-350fa34f187f', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Half Astern', 65, 7.5, 8.2, 6);
INSERT INTO public.ship_pilot_card_data VALUES ('56e0dae5-fe8e-4b45-8172-ce66c7588d78', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Half Ahead', 65, 13, 14.2, 1);
INSERT INTO public.ship_pilot_card_data VALUES ('678009d0-2cdf-4110-8466-15d4f2ee9289', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Slow Ahead', 50, 9.5, 10.5, 2);
INSERT INTO public.ship_pilot_card_data VALUES ('9a1d03f6-33d0-415e-ab5c-89d8e253d246', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Full Ahead Manoeuvring', 80, 16.5, 17.8, 0);
INSERT INTO public.ship_pilot_card_data VALUES ('a64af3f5-541e-43ff-a738-ad67e519646e', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Slow Astern', 50, 5.5, 6, 5);
INSERT INTO public.ship_pilot_card_data VALUES ('e7859bd5-83bc-4453-b882-b763b52a8701', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Full Astern', 80, 10, 11, 7);


--
-- Data for Name: ship_propellers; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.ship_propellers VALUES ('b305cb58-8d35-43df-ac5d-285c38fe7aa3', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', '(FPP) Fixed Pitch Propeller', 6, 'Clockwise', 9100, 7280, 0.8, 0);


--
-- Data for Name: ship_rudders; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.ship_rudders VALUES ('f41ddb03-b5b8-4f4c-bd3e-1ad89c0bd727', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Semi-balanced Spade', 0);


--
-- Data for Name: ship_shaft_generators; Type: TABLE DATA; Schema: public; Owner: edge_user
--

INSERT INTO public.ship_shaft_generators VALUES ('2027c406-7300-49ab-9aad-799689b77b2c', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 3500, 0);


--
-- Data for Name: ship_sternthrusters; Type: TABLE DATA; Schema: public; Owner: edge_user
--



--
-- Data for Name: store_locations; Type: TABLE DATA; Schema: public; Owner: edge_user
--



--
-- Name: countries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: edge_user
--

SELECT pg_catalog.setval('public.countries_id_seq', 15, true);


--
-- Name: material_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: edge_user
--

SELECT pg_catalog.setval('public.material_categories_id_seq', 63, true);


--
-- Name: ports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: edge_user
--

SELECT pg_catalog.setval('public.ports_id_seq', 150, true);


--
-- Name: ranks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: edge_user
--

SELECT pg_catalog.setval('public.ranks_id_seq', 20, true);


--
-- Name: report_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: edge_user
--

SELECT pg_catalog.setval('public.report_types_id_seq', 5, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: edge_user
--

SELECT pg_catalog.setval('public.roles_id_seq', 11, true);


--
-- PostgreSQL database dump complete
--

\unrestrict fqe6KbNWQ6c1PfJiXcOe7CbHlO47xl45Vg5JnP7ByUpmrrSed5xJSAYhcRqidWQ


