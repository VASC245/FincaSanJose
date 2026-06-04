-- ============================================================
-- 003_seed_data.sql
-- Datos de semilla para el sistema de gestión de finca
-- ============================================================

-- ============================================================
-- VACUNAS BOVINAS (5)
-- ============================================================
INSERT INTO vaccines (id, name, description, manufacturer, disease_target) VALUES
  (
    gen_random_uuid(),
    'Aftosa Bivalente',
    'Vacuna bivalente contra fiebre aftosa tipos O y A. Aplicar cada 6 meses.',
    'Biogénesis Bagó',
    'Fiebre Aftosa'
  ),
  (
    gen_random_uuid(),
    'Brucelosis RB51',
    'Vacuna viva para hembras bovinas entre 3 y 8 meses. Aplicación única.',
    'MSD Animal Health',
    'Brucelosis'
  ),
  (
    gen_random_uuid(),
    'IBR/DVB Combovac',
    'Vacuna combinada contra Rinotraqueítis Infecciosa Bovina y Diarrea Viral Bovina. Revacunar anualmente.',
    'Zoetis',
    'IBR / DVB'
  ),
  (
    gen_random_uuid(),
    'Clostridial 8-Way',
    'Vacuna polivalente contra 8 clostridios (carbunclo, enterotoxemia, edema maligno). Refuerzo anual.',
    'Elanco',
    'Clostridios'
  ),
  (
    gen_random_uuid(),
    'Leptospira Pentavalente',
    'Protección contra 5 serovares de Leptospira. Especialmente importante en hembras gestantes.',
    'Hipra',
    'Leptospirosis'
  );

-- ============================================================
-- VACUNAS PORCINAS (4)
-- ============================================================
INSERT INTO vaccines (id, name, description, manufacturer, disease_target) VALUES
  (
    gen_random_uuid(),
    'PPC Lapinizada',
    'Vacuna contra Peste Porcina Clásica (cólera porcino). Inmunidad duradera. Revacunar cada 6 meses.',
    'Laboratorio Aftogen',
    'Peste Porcina Clásica'
  ),
  (
    gen_random_uuid(),
    'Parvovirus Porcino + Erisipela',
    'Vacuna combinada para reproductores. Previene fallas reproductivas. Aplicar 2-4 semanas preparto.',
    'Boehringer Ingelheim',
    'Parvovirosis / Erisipela'
  ),
  (
    gen_random_uuid(),
    'Circovirus PCV2',
    'Vacuna contra Circovirus porcino tipo 2. Reduce síndrome de desmedro postdestete.',
    'Zoetis',
    'Circovirus PCV2'
  ),
  (
    gen_random_uuid(),
    'Mycoplasma Hyopneumoniae',
    'Vacuna contra neumonía enzoótica porcina. Aplicar a lechones a partir de 1 semana de edad.',
    'MSD Animal Health',
    'Neumonía Enzoótica Porcina'
  );

-- ============================================================
-- CATEGORÍAS DE INVENTARIO (4)
-- ============================================================
INSERT INTO inventory_categories (id, name, description) VALUES
  (
    gen_random_uuid(),
    'Medicamentos',
    'Antibióticos, antiparasitarios, vitaminas, vacunas y demás productos veterinarios'
  ),
  (
    gen_random_uuid(),
    'Alimentos',
    'Concentrados, sales minerales, suplementos nutricionales y forrajes almacenados'
  ),
  (
    gen_random_uuid(),
    'Herramientas',
    'Implementos manuales: palas, azadones, tijeras de podar, jeringas, identificadores'
  ),
  (
    gen_random_uuid(),
    'Equipos',
    'Maquinaria, motobombas, fumigadoras, básculas y equipos eléctricos'
  );

-- ============================================================
-- ANIMALES DE EJEMPLO (3 vacas, 2 cerdos)
-- ============================================================
-- Se usan variables de sesión para referenciar los IDs entre inserts
DO $$
DECLARE
  v_vaca1   UUID := gen_random_uuid();
  v_vaca2   UUID := gen_random_uuid();
  v_vaca3   UUID := gen_random_uuid();
  v_cerdo1  UUID := gen_random_uuid();
  v_cerdo2  UUID := gen_random_uuid();
BEGIN
  -- ----- VACA 1 -----
  INSERT INTO animals (id, name, ear_tag, species, sex, birth_date, status, notes)
  VALUES (
    v_vaca1,
    'Estrella',
    'BOV-001',
    'cattle',
    'female',
    '2020-03-15',
    'active',
    'Vaca lechera, raza Holstein. Buena productora.'
  );
  INSERT INTO cattle_details (animal_id, is_pregnant, conception_date, expected_birth, last_birth_date, birth_count)
  VALUES (v_vaca1, TRUE, '2026-01-10', '2026-10-20', '2025-04-05', 3);

  -- ----- VACA 2 -----
  INSERT INTO animals (id, name, ear_tag, species, sex, birth_date, status, notes)
  VALUES (
    v_vaca2,
    'Canela',
    'BOV-002',
    'cattle',
    'female',
    '2019-07-22',
    'active',
    'Vaca de doble propósito, raza Brahman cruzada.'
  );
  INSERT INTO cattle_details (animal_id, is_pregnant, conception_date, expected_birth, last_birth_date, birth_count)
  VALUES (v_vaca2, FALSE, NULL, NULL, '2025-11-12', 4);

  -- ----- VACA 3 -----
  INSERT INTO animals (id, name, ear_tag, species, sex, birth_date, status, notes)
  VALUES (
    v_vaca3,
    'Paloma',
    'BOV-003',
    'cattle',
    'female',
    '2022-01-05',
    'active',
    'Novilla de primera gestación.'
  );
  INSERT INTO cattle_details (animal_id, is_pregnant, conception_date, expected_birth, last_birth_date, birth_count)
  VALUES (v_vaca3, TRUE, '2026-02-01', '2026-11-11', NULL, 0);

  -- ----- CERDA 1 -----
  INSERT INTO animals (id, name, ear_tag, species, sex, birth_date, status, notes)
  VALUES (
    v_cerdo1,
    'Rosada',
    'POR-001',
    'pig',
    'female',
    '2023-05-10',
    'active',
    'Cerda reproductora, raza Landrace.'
  );
  INSERT INTO pig_details (animal_id, is_pregnant, service_date, expected_birth, litter_count)
  VALUES (v_cerdo1, TRUE, '2026-03-05', '2026-07-02', 2);

  -- ----- CERDO 2 -----
  INSERT INTO animals (id, name, ear_tag, species, sex, birth_date, status, notes)
  VALUES (
    v_cerdo2,
    'Manchas',
    'POR-002',
    'pig',
    'male',
    '2023-04-20',
    'active',
    'Verraco reproductor, raza Duroc.'
  );
  -- Los machos no tienen datos reproductivos de gestación pero se registran igual
  INSERT INTO pig_details (animal_id, is_pregnant, service_date, expected_birth, litter_count)
  VALUES (v_cerdo2, FALSE, NULL, NULL, 0);
END $$;

-- ============================================================
-- TAREAS DE EJEMPLO (3)
-- ============================================================
INSERT INTO tasks (title, description, status, priority, due_date, category) VALUES
  (
    'Vacunación semestral contra Fiebre Aftosa',
    'Aplicar vacuna bivalente Aftosa a todos los bovinos activos del lote. Registrar dosis y lote del biológico.',
    'pending',
    'high',
    (CURRENT_DATE + INTERVAL '7 days')::date,
    'health'
  ),
  (
    'Revisión de cercas perimetrales',
    'Inspeccionar y reparar el perímetro del potrero norte. Reemplazar postes deteriorados y tensar alambre de púas.',
    'pending',
    'medium',
    (CURRENT_DATE + INTERVAL '14 days')::date,
    'maintenance'
  ),
  (
    'Compra de concentrado para cerdos',
    'Solicitar 500 kg de concentrado inicio para lechones y 300 kg de concentrado gestación para cerdas.',
    'in_progress',
    'urgent',
    CURRENT_DATE::date,
    'feeding'
  );
