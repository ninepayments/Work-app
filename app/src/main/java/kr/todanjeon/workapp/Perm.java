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
    static final String STAFF_VIEW = "staff_view";
    static final String STAFF_MANAGE = "staff_manage";

    static final String[] KEYS = {TASK_CREATE, TASK_ASSIGN, TASK_VIEW_ALL, HISTORY_ALL, NOTICE_WRITE, PERF_VIEW, REPORT_VIEW, MERCHANT_EDIT, STAFF_VIEW, STAFF_MANAGE};
    static final String[] LABELS = {"업무 만들기", "다른 직원에게 업무 배정", "전체 업무 보기",
            "전체 이력 보기", "공지 작성", "실적 보기 (본부장·대표님)", "일일보고·실적보고 종합 보기 (대표님)", "가맹점 등록·수정 (암호 필요)", "직원 정보 보기 (부서·직책·생년월일·연락처·주소)", "직원 관리 (관리자 전용)"};

    static final String[] PRESET_NAMES = {"영업직", "사무직", "관리자"};

    static List<String> preset(String name) {
        if ("관리자".equals(name)) return new ArrayList<>(Arrays.asList(KEYS));
        if ("사무직".equals(name)) return new ArrayList<>(Arrays.asList(TASK_CREATE, TASK_ASSIGN, TASK_VIEW_ALL, HISTORY_ALL, MERCHANT_EDIT));
        return new ArrayList<>(Arrays.asList(TASK_CREATE));
    }

    private Perm() {
    }
}
