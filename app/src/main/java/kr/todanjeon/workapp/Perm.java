package kr.todanjeon.workapp;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** 직원별로 켜고 끄는 권한 항목과 기본 프리셋. */
final class Perm {
    static final String TASK_VIEW_ALL = "task_view_all";
    static final String TASK_CREATE = "task_create";
    static final String TASK_ASSIGN = "task_assign";
    static final String HISTORY_ALL = "history_all";
    static final String NOTICE_WRITE = "notice_write";
    static final String PERF_VIEW = "perf_view";
    static final String REPORT_VIEW = "report_view";
    static final String MERCHANT_EDIT = "merchant_edit";
    static final String DATA_DELETE = "data_delete"; // 중요 자료 삭제 (가맹점·계약·재고)
    static final String STAFF_VIEW = "staff_view";
    static final String STAFF_MANAGE = "staff_manage";

    static final String[] KEYS = {TASK_CREATE, TASK_ASSIGN, TASK_VIEW_ALL, HISTORY_ALL, NOTICE_WRITE, PERF_VIEW, REPORT_VIEW, MERCHANT_EDIT, DATA_DELETE, STAFF_VIEW, STAFF_MANAGE};
    static final String[] LABELS = {"업무 만들기", "다른 직원에게 업무 배정", "전체 업무 보기",
            "전체 이력 보기", "공지 작성", "실적 보기 (본부장·대표님)", "일일보고·실적보고 종합 보기 (대표님)", "가맹점 정보 수정 (암호 필요)", "중요 자료 삭제 (가맹점·계약·재고)", "직원 정보 보기 (부서·직책·생년월일·연락처·주소)", "직원 관리 (관리자 전용)"};

    // 권한 체계: 역할 3단계 + 항목별 체크(세부 조정) — 웹 PRESETS 와 같음
    // 최고관리자 = 모든 권한 + super 표시(최고관리자만 줄 수 있음) / 운영자 = 등록·수정·실적·보고서(중요 자료 삭제·직원 관리 제외) / 멤버 = 기본
    static final String[] PRESET_NAMES = {"멤버", "운영자", "최고관리자"};

    static List<String> preset(String name) {
        if ("최고관리자".equals(name)) return new ArrayList<>(Arrays.asList(KEYS));
        if ("운영자".equals(name)) {
            List<String> l = new ArrayList<>(Arrays.asList(KEYS));
            l.remove(STAFF_MANAGE);
            l.remove(DATA_DELETE);
            return l;
        }
        return new ArrayList<>(Arrays.asList(TASK_CREATE));
    }

    private Perm() {
    }
}
