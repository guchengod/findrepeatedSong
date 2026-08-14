package main

import (
	"fmt"
	"sync"
)

var managedJobs = struct {
	sync.Mutex
	active map[string]bool
}{active: make(map[string]bool)}

// startManagedJob prevents duplicate requests from launching competing scans or
// metadata writes before the browser receives the first WebSocket update.
func startManagedJob(name string, work func(), onPanic func(error)) bool {
	managedJobs.Lock()
	conflictsWithScan := (name == "scan" && managedJobs.active["pipeline"]) || (name == "pipeline" && managedJobs.active["scan"])
	if managedJobs.active[name] || conflictsWithScan {
		managedJobs.Unlock()
		return false
	}
	managedJobs.active[name] = true
	managedJobs.Unlock()

	go func() {
		defer func() {
			if recovered := recover(); recovered != nil && onPanic != nil {
				onPanic(fmt.Errorf("任务异常终止：%v", recovered))
			}
			managedJobs.Lock()
			delete(managedJobs.active, name)
			managedJobs.Unlock()
		}()
		work()
	}()
	return true
}
