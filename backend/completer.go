package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sync"
	"time"
)

var (
	mbClient = &http.Client{Timeout: 10 * time.Second}
	mbLastReq = time.Now()
	mbMu sync.Mutex

	completeProgress struct {
		sync.RWMutex
		IsRunning bool
		Processed int
		Total     int
		Status    string
	}
)

type MBRecordingResponse struct {
	Recordings []struct {
		Title  string `json:"title"`
		ArtistCredit []struct {
			Name string `json:"name"`
		} `json:"artist-credit"`
		Releases []struct {
			Title string `json:"title"`
			ID    string `json:"id"`
		} `json:"releases"`
	} `json:"recordings"`
}

func mbRequest(uri string) ([]byte, error) {
	mbMu.Lock()
	defer mbMu.Unlock()

	// 1 request per second rule
	elapsed := time.Since(mbLastReq)
	if elapsed < time.Second {
		time.Sleep(time.Second - elapsed)
	}

	req, _ := http.NewRequest("GET", uri, nil)
	req.Header.Set("User-Agent", "FindRepeatedSong/1.0.0 ( contact@example.com )")
	req.Header.Set("Accept", "application/json")

	resp, err := mbClient.Do(req)
	mbLastReq = time.Now()
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("MusicBrainz API error: %d", resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}

func searchMetadata(artist, title string) (newArtist, newAlbum, newTitle string, err error) {
	query := fmt.Sprintf("artist:\"%s\" AND recording:\"%s\"", artist, title)
	if artist == "Unknown Artist" {
		query = fmt.Sprintf("recording:\"%s\"", title)
	}
	
	u := fmt.Sprintf("https://musicbrainz.org/ws/2/recording?query=%s&fmt=json", url.QueryEscape(query))
	data, err := mbRequest(u)
	if err != nil {
		return "", "", "", err
	}

	var res MBRecordingResponse
	if err := json.Unmarshal(data, &res); err != nil {
		return "", "", "", err
	}

	if len(res.Recordings) > 0 {
		rec := res.Recordings[0]
		newTitle = rec.Title
		if len(rec.ArtistCredit) > 0 {
			newArtist = rec.ArtistCredit[0].Name
		}
		if len(rec.Releases) > 0 {
			newAlbum = rec.Releases[0].Title
		}
	}
	return
}

func doComplete() {
	completeProgress.Lock()
	if completeProgress.IsRunning {
		completeProgress.Unlock()
		return
	}
	completeProgress.IsRunning = true
	completeProgress.Processed = 0
	completeProgress.Status = "Fetching songs..."
	completeProgress.Unlock()

	defer func() {
		completeProgress.Lock()
		completeProgress.IsRunning = false
		completeProgress.Status = "Done"
		completeProgress.Unlock()
	}()

	var songs []SongFile
	db.Where("deleted = ?", false).Find(&songs)
	
	completeProgress.Lock()
	completeProgress.Total = len(songs)
	completeProgress.Status = "Completing metadata..."
	completeProgress.Unlock()

	for _, song := range songs {
		na, nal, nt, err := searchMetadata(song.Artist, song.Title)
		if err == nil && nt != "" {
			song.Artist = na
			song.Album = nal
			song.Title = nt
			db.Save(&song)
		}
		
		completeProgress.Lock()
		completeProgress.Processed++
		completeProgress.Unlock()
	}
}
