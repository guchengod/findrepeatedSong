package main

import "testing"

func TestEnvOrDefault(t *testing.T) {
	t.Setenv("FINDREPEATEDSONG_TEST_VALUE", "configured")
	if got := envOrDefault("FINDREPEATEDSONG_TEST_VALUE", "fallback"); got != "configured" {
		t.Fatalf("envOrDefault() = %q, want configured value", got)
	}

	t.Setenv("FINDREPEATEDSONG_TEST_VALUE", "")
	if got := envOrDefault("FINDREPEATEDSONG_TEST_VALUE", "fallback"); got != "fallback" {
		t.Fatalf("envOrDefault() = %q, want fallback", got)
	}
}
