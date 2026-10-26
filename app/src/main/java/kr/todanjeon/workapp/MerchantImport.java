package kr.todanjeon.workapp;

import android.util.Xml;

import org.xmlpull.v1.XmlPullParser;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** 이카운트 등에서 내려받은 엑셀(.xlsx)·CSV 를 표(행/열 글자)로 읽고, 머리글로 가맹점 항목을 찾아낸다. */
final class MerchantImport {
    private MerchantImport() {
    }

    static List<List<String>> read(byte[] data, String fname) throws Exception {
        boolean zip = data.length > 3 && data[0] == 'P' && data[1] == 'K';
        if (zip) return readXlsx(data);
        if (data.length > 4 && (data[0] & 0xFF) == 0xD0 && (data[1] & 0xFF) == 0xCF) {
            throw new Exception("옛 엑셀(.xls) 형식이에요. 엑셀에서 '다른 이름으로 저장 → Excel 통합 문서(.xlsx)' 또는 CSV 로 저장해서 올려 주세요.");
        }
        return readCsv(decode(data));
    }

    private static String decode(byte[] b) {
        int off = 0;
        if (b.length >= 3 && (b[0] & 0xFF) == 0xEF && (b[1] & 0xFF) == 0xBB && (b[2] & 0xFF) == 0xBF) off = 3;
        try {
            return Charset.forName("UTF-8").newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(b, off, b.length - off)).toString();
        } catch (CharacterCodingException e) {
            return new String(b, Charset.forName("EUC-KR"));
        }
    }

    static List<List<String>> readCsv(String s) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean q = false;
        char sep = ',';
        String first = s.length() > 2000 ? s.substring(0, 2000) : s;
        int tabs = first.length() - first.replace("\t", "").length();
        int commas = first.length() - first.replace(",", "").length();
        if (tabs > commas) sep = '\t';
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (q) {
                if (c == '"') {
                    if (i + 1 < s.length() && s.charAt(i + 1) == '"') {
                        cur.append('"');
                        i++;
                    } else q = false;
                } else cur.append(c);
            } else if (c == '"') q = true;
            else if (c == sep) {
                row.add(cur.toString());
                cur.setLength(0);
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < s.length() && s.charAt(i + 1) == '\n') i++;
                row.add(cur.toString());
                cur.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
            } else cur.append(c);
        }
        if (cur.length() > 0 || !row.isEmpty()) {
            row.add(cur.toString());
            rows.add(row);
        }
        return rows;
    }

    private static byte[] all(ZipInputStream z) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = z.read(buf)) > 0) o.write(buf, 0, n);
        return o.toByteArray();
    }

    private static List<List<String>> readXlsx(byte[] data) throws Exception {
        byte[] shared = null;
        Map<String, byte[]> sheets = new HashMap<>();
        ZipInputStream z = new ZipInputStream(new ByteArrayInputStream(data));
        ZipEntry e;
        while ((e = z.getNextEntry()) != null) {
            String n = e.getName();
            if (n.equals("xl/sharedStrings.xml")) shared = all(z);
            else if (n.startsWith("xl/worksheets/sheet") && n.endsWith(".xml")) sheets.put(n, all(z));
        }
        if (sheets.isEmpty()) throw new Exception("엑셀 안에서 시트를 찾지 못했어요.");
        List<String> names = new ArrayList<>(sheets.keySet());
        java.util.Collections.sort(names);
        List<String> ss = new ArrayList<>();
        if (shared != null) {
            XmlPullParser p = Xml.newPullParser();
            p.setInput(new ByteArrayInputStream(shared), "UTF-8");
            StringBuilder cur = null;
            boolean inT = false;
            for (int t = p.getEventType(); t != XmlPullParser.END_DOCUMENT; t = p.next()) {
                if (t == XmlPullParser.START_TAG) {
                    if (p.getName().equals("si")) cur = new StringBuilder();
                    else if (p.getName().equals("t")) inT = true;
                } else if (t == XmlPullParser.TEXT) {
                    if (inT && cur != null) cur.append(p.getText());
                } else if (t == XmlPullParser.END_TAG) {
                    if (p.getName().equals("t")) inT = false;
                    else if (p.getName().equals("si")) {
                        ss.add(cur == null ? "" : cur.toString());
                        cur = null;
                    }
                }
            }
        }
        List<List<String>> best = null;
        for (String sn : names) {
            List<List<String>> r = readSheet(sheets.get(sn), ss);
            if (best == null || r.size() > best.size()) best = r;
        }
        return best;
    }

    private static int colOf(String ref) {
        int c = 0;
        for (int i = 0; i < ref.length(); i++) {
            char ch = ref.charAt(i);
            if (ch >= 'A' && ch <= 'Z') c = c * 26 + (ch - 'A' + 1);
            else break;
        }
        return Math.max(0, c - 1);
    }

    private static List<List<String>> readSheet(byte[] xml, List<String> ss) throws Exception {
        List<List<String>> rows = new ArrayList<>();
        XmlPullParser p = Xml.newPullParser();
        p.setInput(new ByteArrayInputStream(xml), "UTF-8");
        List<String> row = null;
        int col = 0;
        String type = "";
        StringBuilder val = null;
        boolean inV = false, inT = false;
        for (int t = p.getEventType(); t != XmlPullParser.END_DOCUMENT; t = p.next()) {
            if (t == XmlPullParser.START_TAG) {
                String n = p.getName();
                if (n.equals("row")) row = new ArrayList<>();
                else if (n.equals("c")) {
                    String r = p.getAttributeValue(null, "r");
                    col = r == null ? (row == null ? 0 : row.size()) : colOf(r);
                    type = p.getAttributeValue(null, "t");
                    if (type == null) type = "";
                    val = new StringBuilder();
                } else if (n.equals("v")) inV = true;
                else if (n.equals("t")) inT = true;
            } else if (t == XmlPullParser.TEXT) {
                if ((inV || inT) && val != null) val.append(p.getText());
            } else if (t == XmlPullParser.END_TAG) {
                String n = p.getName();
                if (n.equals("v")) inV = false;
                else if (n.equals("t")) inT = false;
                else if (n.equals("c") && row != null && val != null) {
                    String v = val.toString();
                    if (type.equals("s")) {
                        try {
                            v = ss.get(Integer.parseInt(v.trim()));
                        } catch (Exception ex) {
                            v = "";
                        }
                    } else if (type.isEmpty() || type.equals("n")) {
                        if (v.contains("E") || v.contains("e")) {
                            try {
                                v = new BigDecimal(v).toPlainString();
                            } catch (Exception ignored) {
                            }
                        } else if (v.endsWith(".0")) v = v.substring(0, v.length() - 2);
                    }
                    while (row.size() < col) row.add("");
                    row.add(v);
                    val = null;
                } else if (n.equals("row") && row != null) {
                    rows.add(row);
                    row = null;
                }
            }
        }
        return rows;
    }

    // ---- 머리글 → 항목
    static String norm(String s) {
        return s == null ? "" : s.replaceAll("[\\s\\u00A0*()\\[\\]·._/-]", "").toLowerCase(java.util.Locale.KOREA);
    }

    private static String fieldOf(String h) {
        h = norm(h);
        if (h.isEmpty()) return null;
        // 응대 기록 열 (가맹점 이름 열보다 먼저 본다: '가맹점 요청사항' 같은 머리글)
        if (h.matches(".*(응대|요청|접수|처리|완료|조치)(일자|날짜|일)$")) return "ldate";
        if (h.contains("응대종류") || h.contains("응대구분") || h.contains("요청구분") || h.contains("접수구분") || h.equals("유형")) return "lkind";
        if (h.contains("요청") || h.contains("접수내용") || h.contains("문의")) return "lreq";
        if (h.contains("처리") || h.contains("조치") || h.contains("결과")) return "lres";
        if (h.contains("사업자") || h.equals("등록번호") || h.contains("bizno")) return "bizno";
        if (h.contains("거래처코드") || h.equals("코드") || h.contains("고객코드")) return "ecode";
        if (h.contains("거래처명") || h.contains("상호") || h.contains("가맹점명") || h.contains("가맹점") || h.contains("업체명") || h.contains("회사명") || h.equals("거래처") || h.equals("이름") || h.equals("고객명")) return "name";
        if (h.contains("대표")) return "owner";
        if (h.contains("핸드폰") || h.contains("휴대") || h.contains("모바일") || h.contains("mobile") || h.equals("hp")) return "mobile";
        if (h.contains("전화") || h.contains("연락처") || h.equals("tel")) return "phone";
        if (h.contains("주소")) return "addr";
        if (h.contains("등급")) return "grade";
        if (h.contains("업태")) return "biztype";
        if (h.contains("종목")) return "bizitem";
        if (h.contains("van")) return "van";
        if (h.contains("계약시작") || h.contains("시작일")) return "cstart";
        if (h.contains("계약종료") || h.contains("종료일") || h.contains("만료")) return "cend";
        if (h.contains("메모") || h.contains("비고")) return "memo";
        return null;
    }

    /** '(예시)'로 시작하는 줄은 양식의 보기라서 올리지 않는다 */
    static boolean isSample(String v) {
        return v != null && v.trim().matches("^\\(?예시\\)?.*");
    }

    /** 엑셀 날짜(숫자 45678)·2026.10.1·20261001·2026-10-01 → 2026-10-01 (못 읽으면 "") */
    static String dateCell(String v) {
        v = v == null ? "" : v.trim();
        if (v.isEmpty()) return "";
        try {
            if (v.matches("^\\d{5}(\\.\\d+)?$")) {
                java.util.Calendar c = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
                c.clear();
                c.set(1899, 11, 30);
                c.add(java.util.Calendar.DAY_OF_MONTH, (int) Math.floor(Double.parseDouble(v)));
                return String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", c.get(java.util.Calendar.YEAR), c.get(java.util.Calendar.MONTH) + 1, c.get(java.util.Calendar.DAY_OF_MONTH));
            }
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("^(\\d{4})\\D+(\\d{1,2})\\D+(\\d{1,2})").matcher(v);
            if (m.find()) return String.format(java.util.Locale.ROOT, "%s-%02d-%02d", m.group(1), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
            m = java.util.regex.Pattern.compile("^(\\d{4})(\\d{2})(\\d{2})$").matcher(v);
            if (m.find()) return m.group(1) + "-" + m.group(2) + "-" + m.group(3);
        } catch (Exception ignored) {
        }
        return "";
    }

    // ---------- 재고 일괄 등록 양식의 머리글 (웹 sFieldOf 와 같음) ----------
    private static String stockFieldOf(String h) {
        h = norm(h);
        if (h.isEmpty()) return null;
        if (h.contains("상품코드") || h.contains("품목코드") || h.equals("코드")) return "code";
        if (h.contains("시리얼") || h.contains("serial") || h.contains("일련번호") || h.equals("sn")) return "serial"; // '시리얼(장비 바코드)'
        if (h.contains("바코드") || h.contains("barcode")) return "barcode";
        if (h.contains("상품명") || h.contains("품목명") || h.contains("품명") || h.contains("모델") || h.contains("제품")) return "name";
        if (h.contains("시리얼") || h.contains("serial") || h.contains("일련번호") || h.contains("s/n") || h.equals("sn")) return "serial";
        if (h.contains("수량")) return "qty";
        if (h.contains("위치") || h.contains("보관") || h.contains("가맹점") || h.contains("설치처") || h.contains("거래처")) return "where";
        if (h.contains("사업자")) return "bizno";
        if (h.contains("설치일") || h.contains("날짜")) return "date";
        if (h.contains("메모") || h.contains("비고")) return "memo";
        return null;
    }

    static Object[] findStockHeader(List<List<String>> rows) {
        for (int i = 0; i < Math.min(rows.size(), 15); i++) {
            Map<String, Integer> m = new HashMap<>();
            List<String> r = rows.get(i);
            for (int c = 0; c < r.size(); c++) {
                String f = stockFieldOf(r.get(c));
                if (f != null && !m.containsKey(f)) m.put(f, c);
            }
            if ((m.containsKey("name") || m.containsKey("code")) && m.containsKey("where")) return new Object[]{i, m};
        }
        return null;
    }

    // ---------- 업로드 양식(.xlsx) 만들기: 안내 줄 + 빈 줄 + 머리글(굵게·노란 바탕) + 예시 줄 — 웹 xlsxOf 와 같은 모양 ----------
    static final String[] M_TPL_HEAD = {"거래처코드", "거래처명(상호)", "사업자등록번호", "대표자명", "전화", "핸드폰", "주소", "등급", "업태", "종목", "VAN사", "계약시작일", "계약종료일", "메모", "응대일자", "응대종류", "요청사항", "처리결과(처리완료)"};
    static final String[] M_TPL_NOTES = {
            "■ 가맹점 일괄 업로드 양식 — 이카운트 ‘거래처등록’ 목록을 엑셀로 내려받아 그대로 올려도 되고, 아래 머리글 밑에 붙여 넣어도 돼요.",
            "■ 거래처명(상호)은 꼭 있어야 해요. 같은 거래처코드·사업자번호·상호가 이미 있으면 새로 만들지 않고 값이 있는 칸만 바꿔요(빈 칸은 그대로).",
            "■ 등급: 0코드·1코드·2코드·3코드·해지가맹점·신규가맹점·협력사 (S·A·B·C 로 적어도 돼요) / 날짜: 2026-10-01 처럼 / ‘(예시)’로 시작하는 줄은 올릴 때 건너뛰어요(지우지 않아도 돼요).",
            "■ 응대 기록(이카운트의 요청사항·처리완료): 요청사항이나 처리결과를 적은 줄은 그 가맹점 응대 기록으로 남아요. 한 가맹점에 여러 건이면 상호만 같게 해서 줄을 여러 개 쓰면 돼요. 응대종류: 방문A/S·원격A/S·전화응대·용지신청·기타(비우면 기타), 응대일자를 비우면 올린 날로 남아요. 같은 날 같은 내용은 두 번 올라가지 않아요."};
    static final String[][] M_TPL_ROWS = {{"(예시) E0001", "(예시) 삼영푸드", "123-45-67890", "홍길동", "062-123-4567", "010-1234-5678", "광주 서구 상무대로 1", "1코드", "음식점", "한식", "KIS정보통신", "2025-01-01", "2027-12-31", "포스 2대", "2026-09-15", "방문A/S", "단말기 용지 걸림", "롤러 청소 후 정상"}, {"(예시) E0001", "(예시) 삼영푸드", "", "", "", "", "", "", "", "", "", "", "", "", "2026-10-02", "용지신청", "영수증 용지 2박스", "택배 발송 완료"}};
    static final int[] M_TPL_W = {12, 22, 16, 10, 14, 14, 30, 8, 10, 10, 14, 12, 12, 20, 12, 12, 30, 30};
    static final String[] S_TPL_HEAD = {"상품코드", "상품명", "상품 바코드", "시리얼(장비 바코드)", "수량", "현재위치", "사업자번호", "설치일", "메모"};
    static final String[] S_TPL_NOTES = {
            "■ 재고 일괄 등록 양식 — 상품코드·상품명·상품 바코드 중 하나는 꼭 적어요(상품 목록에 없으면 새 상품코드로 등록돼요). 시리얼이 있으면 한 줄에 한 대, 없으면 수량을 적어요.",
            "■ 상품 바코드 = 상자에 찍힌 바코드(같은 상품이면 모두 같음, 용지 같은 소모품) / 시리얼(장비 바코드) = 단말기마다 다른 번호(스캐너로 찍으면 이 칸).",
            "■ 현재위치: ‘본사’ 또는 ‘광주지사’ → 우리 재고로 잡혀요 / 가맹점 상호 → 이미 설치된 장비로 기록만 하고 재고 수에는 넣지 않아요(가맹점이 앱에 등록돼 있어야 해요, 사업자번호를 적으면 더 정확해요).",
            "■ 설치일: 가맹점에 설치된 날(선택, 2026-10-01 처럼) / ‘(예시)’로 시작하는 줄은 올릴 때 건너뛰어요."};
    static final String[][] S_TPL_ROWS = {{"(예시) P0001", "토스 포스 T2", "", "T2-0001", "1", "본사", "", "", ""}, {"(예시)", "영수증 용지", "8801234567890", "", "30", "광주지사", "", "", "박스 단위"}, {"(예시)", "토스 포스 T2", "", "T2-0009", "1", "삼영푸드", "123-45-67890", "2025-03-02", ""}};
    static final int[] S_TPL_W = {12, 22, 18, 22, 8, 16, 16, 12, 20};

    private static String x(String v) {
        return (v == null ? "" : v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }

    private static String col(int i) {
        int n = i + 1;
        StringBuilder s = new StringBuilder();
        while (n > 0) {
            s.insert(0, (char) ('A' + (n - 1) % 26));
            n = (n - 1) / 26;
        }
        return s.toString();
    }

    static byte[] xlsx(String[] notes, String[] head, String[][] rows, int[] widths) throws Exception {
        StringBuilder b = new StringBuilder();
        int rn = 0;
        List<String[]> all = new ArrayList<>();
        List<Integer> st = new ArrayList<>();
        for (String n : notes) {
            all.add(new String[]{n});
            st.add(2);
        }
        all.add(new String[0]);
        st.add(0);
        all.add(head);
        st.add(1);
        for (String[] r : rows) {
            all.add(r);
            st.add(0);
        }
        for (int k = 0; k < all.size(); k++) {
            rn++;
            b.append("<row r=\"").append(rn).append("\">");
            String[] cells = all.get(k);
            for (int i = 0; i < cells.length; i++)
                b.append("<c r=\"").append(col(i)).append(rn).append("\" t=\"inlineStr\"").append(st.get(k) > 0 ? " s=\"" + st.get(k) + "\"" : "").append("><is><t xml:space=\"preserve\">").append(x(cells[i])).append("</t></is></c>");
            b.append("</row>");
        }
        StringBuilder cols = new StringBuilder();
        for (int i = 0; i < head.length; i++) cols.append("<col min=\"").append(i + 1).append("\" max=\"").append(i + 1).append("\" width=\"").append(i < widths.length ? widths[i] : 16).append("\" customWidth=\"1\"/>");
        String H = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";
        String sheet = H + "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><cols>" + cols + "</cols><sheetData>" + b + "</sheetData></worksheet>";
        String styles = H + "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><fonts count=\"3\"><font><sz val=\"11\"/><name val=\"맑은 고딕\"/></font><font><b/><sz val=\"11\"/><name val=\"맑은 고딕\"/></font><font><sz val=\"10\"/><color rgb=\"FF8F6B14\"/><name val=\"맑은 고딕\"/></font></fonts><fills count=\"3\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill><fill><patternFill patternType=\"solid\"><fgColor rgb=\"FFF7EFD9\"/></patternFill></fill></fills><borders count=\"1\"><border/></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"3\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/><xf numFmtId=\"0\" fontId=\"1\" fillId=\"2\" borderId=\"0\" xfId=\"0\" applyFont=\"1\" applyFill=\"1\"/><xf numFmtId=\"0\" fontId=\"2\" fillId=\"0\" borderId=\"0\" xfId=\"0\" applyFont=\"1\"/></cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>";
        String[][] files = {
                {"[Content_Types].xml", H + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>"},
                {"_rels/.rels", H + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>"},
                {"xl/workbook.xml", H + "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"양식\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>"},
                {"xl/_rels/workbook.xml.rels", H + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>"},
                {"xl/worksheets/sheet1.xml", sheet},
                {"xl/styles.xml", styles}};
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        java.util.zip.ZipOutputStream z = new java.util.zip.ZipOutputStream(bo);
        for (String[] f : files) {
            z.putNextEntry(new ZipEntry(f[0]));
            z.write(f[1].getBytes("UTF-8"));
            z.closeEntry();
        }
        z.close();
        return bo.toByteArray();
    }

    /** 표에서 머리글 줄을 찾는다. 돌려주는 값: [머리글 줄 번호, 항목별 열 번호 맵]. 못 찾으면 null. */
    static Object[] findHeader(List<List<String>> rows) {
        for (int i = 0; i < Math.min(rows.size(), 15); i++) {
            Map<String, Integer> m = new HashMap<>();
            List<String> r = rows.get(i);
            for (int c = 0; c < r.size(); c++) {
                String f = fieldOf(r.get(c));
                if (f != null && !m.containsKey(f)) m.put(f, c);
            }
            if (m.containsKey("name") && m.size() >= 2) return new Object[]{i, m};
        }
        return null;
    }

    static String cell(List<String> r, Map<String, Integer> m, String f) {
        Integer c = m.get(f);
        if (c == null || c >= r.size()) return "";
        String v = r.get(c);
        return v == null ? "" : v.trim();
    }

    static String bizFmt(String raw) {
        String d = raw.replaceAll("[^0-9]", "");
        if (d.length() == 10) return d.substring(0, 3) + "-" + d.substring(3, 5) + "-" + d.substring(5);
        return raw.trim();
    }

    static int gradeOf(String g) {
        g = g.trim().toUpperCase(java.util.Locale.KOREA);
        if (g.isEmpty()) return -1;
        if (g.startsWith("S")) return 0;
        if (g.startsWith("A")) return 1;
        if (g.startsWith("B")) return 2;
        if (g.startsWith("C")) return 3;
        if (g.contains("해지")) return 4;
        if (g.contains("신규")) return 5;
        if (g.contains("협력")) return 7;
        String d = g.replaceAll("[^0-9]", "");
        if (!d.isEmpty()) {
            int n = Integer.parseInt(d.substring(0, 1));
            if (n >= 0 && n <= 7 && n != 6) return n;
        }
        return -1;
    }
}
