package main

import "testing"

func TestSanitizeFolderName(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "preserves UTF-8 Chinese metadata",
			input: "周杰伦",
			want:  "周杰伦",
		},
		{
			name:  "decodes legacy GBK Chinese metadata",
			input: "\xd6\xdc\xbd\xdc\xc2\xd7",
			want:  "周杰伦",
		},
		{
			name:  "replaces path separators",
			input: "Artist/Album: Live",
			want:  "Artist_Album_ Live",
		},
		{
			name:  "uses a fallback for blank metadata",
			input: "   ",
			want:  "Unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizeFolderName(tt.input); got != tt.want {
				t.Fatalf("sanitizeFolderName(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
