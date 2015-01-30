package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"gopkg.in/mgo.v2"
	"gopkg.in/mgo.v2/bson"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"time"
)

type TetryonConfig struct {
	MongoConfig MongoConfig `json:"mongodb"`
	HttpConfig  HttpConfig  `json:"http"`
	HttpsConfig HttpsConfig `json:"https"`
}

type MongoConfig struct {
	Hostname string `json:"hostname"`
	Database string `json:"database"`
	Username string `json:"username"`
	Password string `json:"password"`
}

type HttpConfig struct {
	Port string `json:"port"`
}

type HttpsConfig struct {
	Port string `json:"port"`
	Key  string `json:"key"`
	Cert string `json:"cert"`
}

type DBStats struct {
	Collections int     `bson:"collections"`
	Objects     int     `bson:"objects"`
	AvgObjSize  float64 `bson:"avgObjSize"`
	DataSize    float64 `bson:"dataSize"`
	StorageSize float64 `bson:"storageSize"`
	FileSize    float64 `bson:"fileSize"`
	IndexSize   float64 `bson:"indexSize"`
}

// 1x1 Transparent GIF
const transparent1x1Gif = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

const configFile = "config.json"

const paramsTypeKey = "_ttynREQUESTTYPE"

func main() {
	var err error
	var responseGifData []byte
	var tetryonConfig *TetryonConfig
	var mongoSession *mgo.Session
	var httpServeMux *http.ServeMux
	var requestParamChannel chan map[string]string
	var requestReceivedChannel chan request

	log.SetPrefix("TETRYON ")

	var configPath string
	flag.StringVar(&configPath, "configpath", "./config", "Path to configuration.")
	flag.Parse()

	if responseGifData, err = loadResponseGif(transparent1x1Gif); err != nil {
		log.Fatal(err)
	}

	if tetryonConfig, err = loadTetryonConfig(configPath); err != nil {
		log.Fatal(err)
	}

	if mongoSession, err = loadMongoSession(tetryonConfig.MongoConfig); err != nil {
		log.Fatal(err)
	}

	if requestReceivedChannel, err = loadRequestReceivedChannel(mongoSession, tetryonConfig); err != nil {
		log.Fatal(err)
	}

	if requestParamChannel, err = loadParamChannel(requestReceivedChannel); err != nil {
		log.Fatal(err)
	}

	httpServeMux = http.NewServeMux()
	httpServeMux.HandleFunc("/beam", handleBeamRequest(responseGifData, requestParamChannel))
	httpServeMux.HandleFunc("/particle", handleParticleRequest(responseGifData, requestParamChannel))
	httpServeMux.HandleFunc("/", http.NotFound)

	go func() {
		if err := http.ListenAndServeTLS(
			":"+tetryonConfig.HttpsConfig.Port,
			tetryonConfig.HttpsConfig.Cert,
			tetryonConfig.HttpsConfig.Key,
			httpServeMux); err != nil {
			log.Fatal(err)
		}
	}()

	go func() {
		if err := http.ListenAndServe(
			":"+tetryonConfig.HttpConfig.Port,
			httpServeMux); err != nil {
			log.Fatal(err)
		}
	}()

	go func() {
		for _ = range time.Tick(30 * time.Minute) {
			logDatabaseStats(mongoSession)
		}
	}()

	// Wait Forever
	ch := make(chan bool)
	<-ch

	log.Fatal(mongoSession)
}

// pass something like activeRequests map[string]chan http.Request
func handleBeamRequest(gifData []byte, requestParamChannel chan map[string]string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// log.Println("Received BEAM request.")

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
		// log.Println("Received PARTICLE request.")

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

func loadTetryonConfig(configPath string) (*TetryonConfig, error) {

	if configPath[len(configPath)-1:] != "/" {
		configPath = configPath + "/"
	}

	tetryonConfigData, err := ioutil.ReadFile(configPath + configFile)

	if err != nil {
		return nil, err
	}

	configFileInfo, _ := os.Stat(configPath + configFile)
	configFileMode := configFileInfo.Mode()

	if configFileMode&0x0007 > 0 {
		return nil, errors.New("Config error: " + configFile + " must not be world-readable.")
	}

	var tetryonConfig TetryonConfig
	json.Unmarshal(tetryonConfigData, &tetryonConfig)

	// Validate Config
	// It would be nice to find a more efficient way to loop this ( including errors
	// with the json key path )
	if len(tetryonConfig.MongoConfig.Hostname) == 0 {
		return nil, errors.New("Config error: missing mongodb.hostname")
	}

	if len(tetryonConfig.MongoConfig.Database) == 0 {
		return nil, errors.New("Config error: missing mongodb.database")
	}

	if len(tetryonConfig.MongoConfig.Username) == 0 {
		return nil, errors.New("Config error: missing mongodb.username")
	}

	if len(tetryonConfig.MongoConfig.Password) == 0 {
		return nil, errors.New("Config error: missing mongodb.password")
	}

	if len(tetryonConfig.HttpConfig.Port) == 0 {
		return nil, errors.New("Config error: missing http.port")
	}

	if len(tetryonConfig.HttpsConfig.Port) == 0 {
		return nil, errors.New("Config error: missing https.port")
	}

	if len(tetryonConfig.HttpsConfig.Cert) == 0 {
		return nil, errors.New("Config error: missing https.cert")
	}

	if len(tetryonConfig.HttpsConfig.Key) == 0 {
		return nil, errors.New("Config error: missing https.key")
	}

	if tetryonConfig.HttpsConfig.Cert[len(tetryonConfig.HttpsConfig.Cert)-1:] != "/" {
		tetryonConfig.HttpsConfig.Cert = configPath + tetryonConfig.HttpsConfig.Cert
	}

	if tetryonConfig.HttpsConfig.Key[len(tetryonConfig.HttpsConfig.Key)-1:] != "/" {
		tetryonConfig.HttpsConfig.Key = configPath + tetryonConfig.HttpsConfig.Key
	}

	return &tetryonConfig, nil
}

func loadMongoSession(mongoConfig MongoConfig) (*mgo.Session, error) {
	session, err := mgo.DialWithInfo(&mgo.DialInfo{
		Addrs:    []string{mongoConfig.Hostname},
		Timeout:  60 * time.Second,
		Database: mongoConfig.Database,
		Username: mongoConfig.Username,
		Password: mongoConfig.Password,
	})
	if err != nil {
		return nil, err
	}

	// See: http://godoc.org/labix.org/v2/mgo#Session.SetMode
	// Eventual = efficient but doesn't preserve order well...
	session.SetMode(mgo.Eventual, true)
	session.SetSafe(&mgo.Safe{})

	return session, nil
}

func handleRequestParameters(parameters map[string]string, activeRequests map[string]*request, requestReceivedChannel chan request) {
	id, _, _, _ := splitRequestId(parameters[keyId])

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

func handleReceivedRequest(r request, session *mgo.Session, config *TetryonConfig) {
	if r.Type == "particle" {
		p := &particle{}
		p.Init(r.Parameters)
		p.Save(session, config)
	}
}

func logDatabaseStats(session *mgo.Session) {
	sessionCopy := session.Copy()
	defer sessionCopy.Close()

	db := sessionCopy.DB("tetryon")

	var dbStats DBStats
	if err := db.Run(bson.D{{"dbStats", 1}, {"scale", 1}}, &dbStats); err != nil {
		log.Println(err)
	}

	log.Println("Database Size: " + fmt.Sprintf("Database Size %0.2f MiB", dbStats.DataSize/1048576))
}