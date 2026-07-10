import assert from "node:assert/strict";
import test from "node:test";
import {
  getActiveNavigationKey,
  getMobileActiveKey,
  routeMotionDirection,
  routeMotionProfile,
  searchResultHref
} from "@/lib/navigation";

test("nested routes activate their owning desktop destinations", () => {
  assert.equal(getActiveNavigationKey("/clients/abc"), "directory");
  assert.equal(getActiveNavigationKey("/contacts"), "directory");
  assert.equal(getActiveNavigationKey("/procurement"), "projects");
  assert.equal(getActiveNavigationKey("/field"), "projects");
  assert.equal(getActiveNavigationKey("/activity"), "activity");
});

test("mobile overflow routes activate More", () => {
  assert.equal(getMobileActiveKey("/billing"), "more");
  assert.equal(getMobileActiveKey("/settings/appearance"), "more");
  assert.equal(getMobileActiveKey("/quotes"), "quotes");
});

test("search destinations use detail pages or focused boards", () => {
  assert.equal(searchResultHref("request", "rq-1"), "/requests/rq-1");
  assert.equal(searchResultHref("client", "cl-1"), "/clients/cl-1");
  assert.equal(searchResultHref("quote", "qt-1"), "/quotes/qt-1");
  assert.equal(searchResultHref("invoice", "in 1"), "/billing?record=in%201");
});

test("route motion follows hierarchy and navigation order", () => {
  assert.equal(routeMotionDirection("/hub", "/quotes"), 1);
  assert.equal(routeMotionDirection("/quotes", "/hub"), -1);
  assert.equal(routeMotionDirection("/requests", "/requests/rq-1"), 1);
  assert.equal(routeMotionDirection("/requests/rq-1", "/requests"), -1);
});

test("route motion profiles route relationship", () => {
  assert.deepEqual(routeMotionProfile("/hub", "/quotes"), {
    kind: "lateral",
    direction: 1
  });
  assert.deepEqual(routeMotionProfile("/quotes", "/hub"), {
    kind: "lateral",
    direction: -1
  });
  assert.deepEqual(routeMotionProfile("/requests", "/requests/rq-1"), {
    kind: "drill-in",
    direction: 1
  });
  assert.deepEqual(routeMotionProfile("/requests/rq-1", "/requests"), {
    kind: "drill-out",
    direction: -1
  });
  assert.deepEqual(routeMotionProfile("/settings/account", "/settings/appearance"), {
    kind: "replace",
    direction: 0
  });
});
