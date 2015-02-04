package main

import (
	"encoding/base64"
	"fmt"
	"gopkg.in/mgo.v2"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
)

type request struct {
	Id            string
	Type          string
	Parameters    map[string]string
	ReceivedParts map[int]bool
}

// Reserved parameter keys
// All other keys are put into particle.Data
const (
	paramPrefix         = "_ttyn"
	paramRequestId      = paramPrefix + "Request"
	paramBeamId         = paramPrefix + "Beam"
	paramEvent          = paramPrefix + "Event"
	paramDomain         = paramPrefix + "Domain"
	paramPath           = paramPrefix + "Path"
	paramBeamIdentifier = paramPrefix + "Identifier"
)

// 1x1 Transparent GIF
const transparent1x1Gif = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

func (r *request) Init(reqType string, reqParams map[string]string) {
	id, _, total, err := splitRequestId(reqParams[paramRequestId])

	if err != nil {
		log.Fatal(err)
	}

	r.Id = id
	r.Type = reqType
	r.ReceivedParts = make(map[int]bool)
	r.Parameters = make(map[string]string)

	for i := 1; i <= total; i++ {
		r.ReceivedParts[i] = false
	}

	r.AddParams(reqParams)
}

func (r *request) AddParams(parameters map[string]string) {
	_, part, _, _ := splitRequestId(parameters[paramRequestId])

	r.ReceivedParts[part] = true

	for key, value := range parameters {
		r.Parameters[key] = value
	}
}

func (r *request) ReceivedAllParts() bool {
	for _, received := range r.ReceivedParts {
		if !received {
			return false
		}
	}
	return true
}

func loadRequestReceivedChannel(session *mgo.Session, config *TetryonConfig) (chan request, error) {
	ch := make(chan request)

	go func() {
		for receivedRequest := range ch {
			handleReceivedRequest(receivedRequest, session, config)
		}
		close(ch)
	}()

	return ch, nil
}

func loadParamChannel(requestReceivedChannel chan request) (chan map[string]string, error) {
	ch := make(chan map[string]string)
	activeRequests := make(map[string]*request)

	go func() {
		for parameters := range ch {
			handleRequestParameters(parameters, activeRequests, requestReceivedChannel)
		}
		close(ch)
	}()

	return ch, nil
}

func loadResponseGif(base64Data string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(base64Data)
}

func handleRequestParameters(parameters map[string]string, activeRequests map[string]*request, requestReceivedChannel chan request) {
	id, _, _, _ := splitRequestId(parameters[paramRequestId])

	requestType := parameters[paramsTypeKey]

	if _, ok := activeRequests[id]; ok {
		activeRequests[id].AddParams(parameters)
	} else {
		activeRequests[id] = &request{Type: requestType}
		activeRequests[id].Init(requestType, parameters)
	}

	if activeRequests[id].ReceivedAllParts() {
		delete(activeRequests[id].Parameters, paramsTypeKey)
		requestReceivedChannel <- *activeRequests[id]
		delete(activeRequests, id)
	}
}

func handleReceivedRequest(r request, session *mgo.Session, config *TetryonConfig) error {
	var err error

	if r.Type == "particle" {
		p := &particle{}

		err = p.Init(r.Parameters)
		if err != nil {
			return err
		}

		err = p.Save(session, config)
		if err != nil {
			return err
		}
	} else if r.Type == "beam" {
		b := &beam{}

		if _, ok := r.Parameters[paramBeamId]; !ok {
			return fmt.Errorf("Beam request missing key: %s", paramBeamId)
		}

		b, err = GetBeamById(r.Parameters[paramBeamId], session, config)

		if err != nil {
			return err
		}

		err = b.Update(r.Parameters, session, config)
		if err != nil {
			return err
		}
	}

	return nil
}

func handleBeamRequest(gifData []byte, requestParamChannel chan map[string]string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.ParseForm() != nil {
			log.Println("Could not parse form.")
			return
		}

		requestParams := make(map[string]string)

		for key, values := range r.Form {
			requestParams[key] = values[0]
		}

		requestParams[paramsTypeKey] = "beam"

		requestParamChannel <- requestParams

		w.Header().Set("Content-Type", "image/gif")
		io.WriteString(w, string(gifData))
	}
}

func handleParticleRequest(gifData []byte, requestParamChannel chan map[string]string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.ParseForm() != nil {
			log.Println("Could not parse form.")
			return
		}

		requestParams := make(map[string]string)

		for key, values := range r.Form {
			requestParams[key] = values[0]
		}

		requestParams[paramsTypeKey] = "particle"

		requestParamChannel <- requestParams

		w.Header().Set("Content-Type", "image/gif")
		io.WriteString(w, string(gifData))
	}
}

/**
 * Split an encoded request ID into the ID, part ( of chunks ), and total ( chunks )
 * Encoded ID format: [id]:[part]-[total]
 * @param  {string} requestId
 * @return {string} The ID of the request.
 * @return {int} The part of the chunks.
 * @return {int} The total number of chunks expected.
 * @return {error} An error if not successful.
 */
func splitRequestId(encodedId string) (string, int, int, error) {
	a := strings.Split(encodedId, ":")
	b := strings.Split(a[1], "-")

	id := a[0]

	var err error
	var part int64
	var total int64

	part, err = strconv.ParseInt(b[0], 10, 32)

	if err != nil {
		return "", 0, 0, err
	}

	total, err = strconv.ParseInt(b[1], 10, 32)

	if err != nil {
		return "", 0, 0, err
	}

	return id, int(part), int(total), nil
}
