ALTER TABLE public.english_lessons
  ADD COLUMN IF NOT EXISTS listening_quiz JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
DECLARE
  l RECORD;
  v_phrases jsonb;
  arr jsonb;
  mc1 jsonb; mc2 jsonb; mc3 jsonb;
  f1 jsonb;  f2 jsonb;
  p0 jsonb; p1 jsonb; p2 jsonb; p3 jsonb; p4 jsonb;
  distractors text[] := ARRAY[
    'See you tomorrow', 'I need some water', 'Where is the bathroom',
    'Thank you very much', 'I do not understand', 'Can you repeat please',
    'I am ready to work', 'How much does it cost', 'My name is Maria',
    'Nice to meet you', 'I am from Brazil', 'I speak a little English',
    'What time is it', 'I am hungry', 'Please help me',
    'I am tired today', 'See you later', 'Have a good day'
  ];
  d1 text; d2 text; d3 text;
  correct_text text;
  first_word text;
  v_template text;
  options_arr jsonb;
  shuffled_idx int;
BEGIN
  FOR l IN
    SELECT el.id AS lid, el.phrases AS ph
    FROM public.english_lessons el
    WHERE jsonb_array_length(COALESCE(el.phrases, '[]'::jsonb)) >= 3
  LOOP
    v_phrases := l.ph;
    p0 := v_phrases -> 0;
    p1 := v_phrases -> 1;
    p2 := v_phrases -> 2;
    p3 := COALESCE(v_phrases -> 3, v_phrases -> 0);
    p4 := COALESCE(v_phrases -> 4, v_phrases -> 1);

    -- MC 1
    correct_text := p0 ->> 'en';
    d1 := distractors[1 + (abs(hashtext(l.lid::text || '1')) % array_length(distractors,1))];
    d2 := distractors[1 + (abs(hashtext(l.lid::text || '2')) % array_length(distractors,1))];
    d3 := distractors[1 + (abs(hashtext(l.lid::text || '3')) % array_length(distractors,1))];
    IF d1 = correct_text THEN d1 := distractors[5]; END IF;
    IF d2 = correct_text OR d2 = d1 THEN d2 := distractors[8]; END IF;
    IF d3 = correct_text OR d3 = d1 OR d3 = d2 THEN d3 := distractors[12]; END IF;
    shuffled_idx := abs(hashtext(l.lid::text)) % 4;
    options_arr := CASE shuffled_idx
      WHEN 0 THEN jsonb_build_array(correct_text, d1, d2, d3)
      WHEN 1 THEN jsonb_build_array(d1, correct_text, d2, d3)
      WHEN 2 THEN jsonb_build_array(d1, d2, correct_text, d3)
      ELSE        jsonb_build_array(d1, d2, d3, correct_text)
    END;
    mc1 := jsonb_build_object('type','mc','audio_text',correct_text,'question_pt','O que você ouviu?','options',options_arr,'correct',shuffled_idx);

    -- MC 2
    correct_text := p1 ->> 'en';
    d1 := distractors[1 + (abs(hashtext(l.lid::text || 'a')) % array_length(distractors,1))];
    d2 := distractors[1 + (abs(hashtext(l.lid::text || 'b')) % array_length(distractors,1))];
    d3 := distractors[1 + (abs(hashtext(l.lid::text || 'c')) % array_length(distractors,1))];
    IF d1 = correct_text THEN d1 := distractors[7]; END IF;
    IF d2 = correct_text OR d2 = d1 THEN d2 := distractors[11]; END IF;
    IF d3 = correct_text OR d3 = d1 OR d3 = d2 THEN d3 := distractors[14]; END IF;
    shuffled_idx := abs(hashtext(l.lid::text || 'x')) % 4;
    options_arr := CASE shuffled_idx
      WHEN 0 THEN jsonb_build_array(correct_text, d1, d2, d3)
      WHEN 1 THEN jsonb_build_array(d1, correct_text, d2, d3)
      WHEN 2 THEN jsonb_build_array(d1, d2, correct_text, d3)
      ELSE        jsonb_build_array(d1, d2, d3, correct_text)
    END;
    mc2 := jsonb_build_object('type','mc','audio_text',correct_text,'question_pt','O que você ouviu?','options',options_arr,'correct',shuffled_idx);

    -- MC 3
    correct_text := p2 ->> 'en';
    d1 := distractors[1 + (abs(hashtext(l.lid::text || 'd')) % array_length(distractors,1))];
    d2 := distractors[1 + (abs(hashtext(l.lid::text || 'e')) % array_length(distractors,1))];
    d3 := distractors[1 + (abs(hashtext(l.lid::text || 'f')) % array_length(distractors,1))];
    IF d1 = correct_text THEN d1 := distractors[3]; END IF;
    IF d2 = correct_text OR d2 = d1 THEN d2 := distractors[6]; END IF;
    IF d3 = correct_text OR d3 = d1 OR d3 = d2 THEN d3 := distractors[10]; END IF;
    shuffled_idx := abs(hashtext(l.lid::text || 'y')) % 4;
    options_arr := CASE shuffled_idx
      WHEN 0 THEN jsonb_build_array(correct_text, d1, d2, d3)
      WHEN 1 THEN jsonb_build_array(d1, correct_text, d2, d3)
      WHEN 2 THEN jsonb_build_array(d1, d2, correct_text, d3)
      ELSE        jsonb_build_array(d1, d2, d3, correct_text)
    END;
    mc3 := jsonb_build_object('type','mc','audio_text',correct_text,'question_pt','O que você ouviu?','options',options_arr,'correct',shuffled_idx);

    -- FILL 1
    correct_text := p3 ->> 'en';
    first_word := split_part(correct_text, ' ', 1);
    v_template := regexp_replace(correct_text, '^' || first_word, '___');
    f1 := jsonb_build_object('type','fill','audio_text',correct_text,'prompt_pt','Ouça e digite a palavra que falta:','template',v_template,'answer',first_word);

    -- FILL 2
    correct_text := p4 ->> 'en';
    first_word := split_part(correct_text, ' ', 1);
    v_template := regexp_replace(correct_text, '^' || first_word, '___');
    f2 := jsonb_build_object('type','fill','audio_text',correct_text,'prompt_pt','Ouça e digite a palavra que falta:','template',v_template,'answer',first_word);

    arr := jsonb_build_array(mc1, mc2, mc3, f1, f2);

    UPDATE public.english_lessons SET listening_quiz = arr WHERE id = l.lid;
  END LOOP;
END $$;